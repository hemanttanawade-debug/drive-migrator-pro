import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMigrationSession,
  downloadReport,
  fetchStorageSizes,
  getMigrationStatus,
  retryFailed,
  saveConfig,
  saveMigrationMode,
  startDiscovery,
  getDiscoverySummary,
  totalsToScanSummary,
  startMigrationFresh,
  resumeMigration,
  uploadSharedDriveMapping,
  uploadUserMapping,
  runPreflight,
} from "@/lib/api";
import { buildApiUrl } from "@/lib/backend";
import { useToast } from "@/hooks/use-toast";
import type {
  ConnectionStatus,
  DomainConfig,
  MigrationConfig,
  MigrationProgress,
  ScanSummary,
  SharedDriveMappingRow,
  UserMappingRow,
  ValidationCheck,
  WizardState,
} from "@/types/migration";
import { normalizeUserMappingFile } from "./user-mapping-utils";
import { normalizeSharedDriveFile } from "./shared-drive-mapping-utils";

const TOTAL_STEPS = 5;

const createInitialChecks = (): ValidationCheck[] => [
  { key: "serviceAccount", label: "Service account credentials", description: "Both source and destination service account JSONs load and authenticate", status: "pending" },
  { key: "domainDelegation", label: "Domain-wide delegation", description: "Admin email can impersonate users on both domains", status: "pending" },
  { key: "cloudSql", label: "Cloud SQL connection", description: "Backend can read/write checkpoint state to Cloud SQL", status: "pending" },
  { key: "gcsBucket", label: "GCS bucket access", description: "Backend can read/write files to the staging GCS bucket", status: "pending" },
];

const createPendingConnectionStatus = (): ConnectionStatus => ({
  source: "pending",
  destination: "pending",
  checks: createInitialChecks(),
});

const createInitialProgress = (): MigrationProgress => ({
  migrationId: "",
  status: "pending",
  totalUsers: 0,
  filesMigrated: 0,
  failedFiles: 0,
  logs: [],
});

const createInitialScan = (): ScanSummary => ({
  totalFiles: 0,
  totalFolders: 0,
  totalSizeGb: 0,
  estimateDays: 0,
  estimateHours: 0,
  scanned: false,
});

const initialState: WizardState = {
  currentStep: 0,
  sessionId: "",
  completedSteps: [],
  domainConfig: {
    sourceDomain: "",
    sourceAdminEmail: "",
    sourceCredentials: null,
    destinationDomain: "",
    destinationAdminEmail: "",
    destinationCredentials: null,
  },
  userMappings: [],
  sharedDriveMappings: [],
  csvFile: null,
  sharedDriveCsvFile: null,
  connectionStatus: createPendingConnectionStatus(),
  migrationConfig: { scope: "my-drive", mode: "custom" },
  scan: createInitialScan(),
  migrationProgress: createInitialProgress(),
};

const markStepCompleted = (steps: number[], step: number) =>
  Array.from(new Set([...steps, step])).sort((a, b) => a - b);

const getErrorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const parseValidationErrors = (errors?: string[]) => {
  const result: { sourceError?: string; destinationError?: string } = {};
  errors?.forEach((error) => {
    if (error.startsWith("Source:")) result.sourceError = error.replace(/^Source:\s*/, "");
    else if (error.startsWith("Destination:")) result.destinationError = error.replace(/^Destination:\s*/, "");
    else {
      result.sourceError ??= error;
      result.destinationError ??= error;
    }
  });
  return result;
};

const scopeToMode = (scope: WizardState["migrationConfig"]["scope"]): WizardState["migrationConfig"]["mode"] => {
  if (scope === "shared-drives") return "shared-drives";
  if (scope === "both") return "full";
  return "custom";
};

export const useMigrationWizard = () => {
  const [state, setState] = useState<WizardState>(initialState);
  const [loadingStates, setLoadingStates] = useState({
    savingConfig: false,
    validating: false,
    uploadingMapping: false,
    uploadingSharedDrive: false,
    fetchingSizes: false,
    savingMode: false,
    scanning: false,
    startingMigration: false,
    downloadingReport: false,
    retrying: false,
  });
  const { toast } = useToast();
  const completionNoticeRef = useRef<string | null>(null);
  // Tracks which credential files were freshly selected (not restored from state).
  // Only fresh files get appended to FormData — prevents ERR_UPLOAD_FILE_CHANGED
  // when re-submitting after the browser has invalidated the original File handle.
  const freshCredsRef = useRef<{ source: boolean; destination: boolean }>({
    source: false,
    destination: false,
  });
  // True once /api/config has been saved successfully — switches subsequent
  // saves to PUT so credential files become optional on the backend.
  const configSavedRef = useRef(false);

  const setLoading = useCallback(
    (key: keyof typeof loadingStates, value: boolean) =>
      setLoadingStates((c) => ({ ...c, [key]: value })),
    []
  );

  const isMigrationRunning = state.migrationProgress.status === "running";

  const maxAccessibleStep = useMemo(() => {
    let unlocked = 0;
    while (unlocked < TOTAL_STEPS - 1 && state.completedSteps.includes(unlocked)) unlocked += 1;
    return unlocked;
  }, [state.completedSteps]);

  const goToStep = useCallback(
    (step: number) =>
      setState((c) => ({
        ...c,
        currentStep: step <= maxAccessibleStep ? step : c.currentStep,
      })),
    [maxAccessibleStep]
  );

  const goBack = useCallback(
    () => setState((c) => ({ ...c, currentStep: Math.max(0, c.currentStep - 1) })),
    []
  );

  const invalidateFromStep = useCallback((step: number) => {
    return (current: WizardState): WizardState => ({
      ...current,
      currentStep: Math.min(current.currentStep, step),
      completedSteps: current.completedSteps.filter((v) => v < step),
      connectionStatus: step <= 1 ? createPendingConnectionStatus() : current.connectionStatus,
      scan: step <= 4 ? createInitialScan() : current.scan,
      migrationProgress: step <= 4 ? createInitialProgress() : current.migrationProgress,
    });
  }, []);

  // Lock all editing once a migration is running.
  const guardEdits = useCallback(() => {
    if (isMigrationRunning) {
      toast({
        title: "Migration is running",
        description: "Project details are locked until the migration finishes.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }, [isMigrationRunning, toast]);

  const updateDomainConfig = useCallback(
    (config: DomainConfig) => {
      if (!guardEdits()) return;
      setState((c) => {
        // Detect which credential files are NEW File instances vs unchanged refs.
        if (config.sourceCredentials && config.sourceCredentials !== c.domainConfig.sourceCredentials) {
          freshCredsRef.current.source = true;
        }
        if (
          config.destinationCredentials &&
          config.destinationCredentials !== c.domainConfig.destinationCredentials
        ) {
          freshCredsRef.current.destination = true;
        }
        return { ...invalidateFromStep(0)(c), domainConfig: config };
      });
    },
    [guardEdits, invalidateFromStep]
  );

  const updateMigrationConfig = useCallback(
    (config: MigrationConfig) => {
      if (!guardEdits()) return;
      setState((c) => ({
        ...invalidateFromStep(2)(c),
        migrationConfig: { ...config, mode: scopeToMode(config.scope) },
        // wipe any irrelevant uploads when scope changes
        csvFile: config.scope === "shared-drives" ? null : c.csvFile,
        userMappings: config.scope === "shared-drives" ? [] : c.userMappings,
        sharedDriveCsvFile: config.scope === "my-drive" ? null : c.sharedDriveCsvFile,
        sharedDriveMappings: config.scope === "my-drive" ? [] : c.sharedDriveMappings,
      }));
    },
    [guardEdits, invalidateFromStep]
  );

  const updateCsvFile = useCallback(
    (file: File | null) => {
      if (!guardEdits()) return;
      setState((c) => ({
        ...invalidateFromStep(2)(c),
        csvFile: file,
        userMappings: file ? c.userMappings : [],
      }));
    },
    [guardEdits, invalidateFromStep]
  );

  const updateUserMappings = useCallback(
    (mappings: UserMappingRow[]) => {
      if (!guardEdits()) return;
      setState((c) => ({ ...invalidateFromStep(2)(c), userMappings: mappings }));
    },
    [guardEdits, invalidateFromStep]
  );

  const updateSharedDriveCsvFile = useCallback(
    (file: File | null) => {
      if (!guardEdits()) return;
      setState((c) => ({
        ...invalidateFromStep(2)(c),
        sharedDriveCsvFile: file,
        sharedDriveMappings: file ? c.sharedDriveMappings : [],
      }));
    },
    [guardEdits, invalidateFromStep]
  );

  const updateSharedDriveMappings = useCallback(
    (mappings: SharedDriveMappingRow[]) => {
      if (!guardEdits()) return;
      setState((c) => ({ ...invalidateFromStep(2)(c), sharedDriveMappings: mappings }));
    },
    [guardEdits, invalidateFromStep]
  );

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId;
    const res = await createMigrationSession();
    setState((c) => ({ ...c, sessionId: res.sessionId }));
    return res.sessionId;
  }, [state.sessionId]);

  // ─── Step 1: Domain config ──────────────────────────────────────────────────

  const submitDomainConfig = useCallback(async () => {
    if (!guardEdits()) return;
    setLoading("savingConfig", true);
    try {
      const sessionId = await ensureSession();
      const fd = new FormData();
      fd.append("sessionId", sessionId);
      fd.append("sourceDomain", state.domainConfig.sourceDomain.trim());
      fd.append("sourceAdminEmail", state.domainConfig.sourceAdminEmail.trim());
      fd.append("destinationDomain", state.domainConfig.destinationDomain.trim());
      fd.append("destinationAdminEmail", state.domainConfig.destinationAdminEmail.trim());

      // Only send credential files that were freshly selected by the user
      // in this browser session. Re-uploading a stale File handle triggers
      // the browser's ERR_UPLOAD_FILE_CHANGED error.
      if (state.domainConfig.sourceCredentials && freshCredsRef.current.source) {
        fd.append("sourceCredentials", state.domainConfig.sourceCredentials);
      }
      if (state.domainConfig.destinationCredentials && freshCredsRef.current.destination) {
        fd.append("destinationCredentials", state.domainConfig.destinationCredentials);
      }

      // First save → POST (creates files on backend).
      // Subsequent saves → PUT (credential files optional, kept if not sent).
      const method = configSavedRef.current ? "PUT" : "POST";
      const res = await saveConfig(fd, method);

      configSavedRef.current = true;
      freshCredsRef.current = { source: false, destination: false };

      setState((c) => ({
        ...c,
        sessionId: res.sessionId,
        completedSteps: markStepCompleted(c.completedSteps, 0),
        currentStep: 1,
      }));
      toast({ title: "Configuration saved!", description: "Domain settings stored in Flask." });
    } catch (e) {
      toast({ title: "Could not save configuration", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("savingConfig", false);
    }
  }, [ensureSession, guardEdits, setLoading, state.domainConfig, toast]);

  // ─── Step 2: Validation ─────────────────────────────────────────────────────

  const runValidation = useCallback(async () => {
    if (!guardEdits()) return;
    setLoading("validating", true);

    setState((c) => ({
      ...c,
      connectionStatus: {
        ...c.connectionStatus,
        checks: c.connectionStatus.checks.map((chk) => ({ ...chk, status: "loading", error: undefined })),
      },
    }));

    try {
      const sessionId = await ensureSession();
      // Use /api/preflight — the real 4-check endpoint (service account,
      // domain delegation, Cloud SQL, GCS bucket). /api/validate only covers 2.
      const res = await runPreflight(sessionId);

      const checkMap: Record<string, "service_account" | "domain_delegation" | "cloud_sql" | "gcs_bucket"> = {
        serviceAccount: "service_account",
        domainDelegation: "domain_delegation",
        cloudSql: "cloud_sql",
        gcsBucket: "gcs_bucket",
      };

      const checks: ValidationCheck[] = createInitialChecks().map((chk) => {
        const backend = res.checks?.[checkMap[chk.key]];
        if (!backend) return { ...chk, status: "error", error: "No result returned" };
        return {
          ...chk,
          status: backend.ok ? "success" : "error",
          error: backend.ok ? undefined : (backend.message || backend.detail),
        };
      });

      const allPassed = res.overall && checks.every((chk) => chk.status === "success");
      const sourceOk = !!(res.checks?.service_account?.ok && res.checks?.domain_delegation?.ok);

      setState((c) => ({
        ...c,
        connectionStatus: {
          source: sourceOk ? "success" : "error",
          destination: sourceOk ? "success" : "error",
          sourceError: res.checks?.service_account?.ok ? undefined : res.checks?.service_account?.message,
          destinationError: res.checks?.domain_delegation?.ok ? undefined : res.checks?.domain_delegation?.message,
          checks,
        },
        completedSteps: allPassed
          ? markStepCompleted(c.completedSteps, 1)
          : c.completedSteps.filter((v) => v < 1).concat(c.completedSteps.includes(0) ? [0] : []),
      }));

      toast({
        title: allPassed ? "All 4 checks passed" : "Pre-flight failed",
        description: allPassed
          ? "Service account, delegation, Cloud SQL and GCS bucket are reachable."
          : checks.find((c) => c.status === "error")?.error || "Review failed checks below.",
        variant: allPassed ? "default" : "destructive",
      });
    } catch (e) {
      setState((c) => ({
        ...c,
        connectionStatus: {
          ...c.connectionStatus,
          source: "error",
          destination: "error",
          sourceError: getErrorMessage(e),
          destinationError: getErrorMessage(e),
          checks: c.connectionStatus.checks.map((chk) => ({ ...chk, status: "error", error: getErrorMessage(e) })),
        },
      }));
      toast({ title: "Validation failed", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("validating", false);
    }
  }, [ensureSession, guardEdits, setLoading, toast]);

  // ─── Step 3: Mappings ───────────────────────────────────────────────────────

  const enrichWithSizes = useCallback(
    async (sessionId: string, mappings: UserMappingRow[]): Promise<UserMappingRow[]> => {
      try {
        setLoading("fetchingSizes", true);
        const [sourceSizes, destSizes] = await Promise.all([
          fetchStorageSizes("source", mappings.map((m) => m.sourceUser), sessionId).catch(() => ({})),
          fetchStorageSizes("destination", mappings.map((m) => m.destinationUser), sessionId).catch(() => ({})),
        ]);
        return mappings.map((m) => ({
          ...m,
          sourceSizeGb: sourceSizes[m.sourceUser]?.drive_gb ?? null,
          destinationSizeGb: destSizes[m.destinationUser]?.drive_gb ?? null,
        }));
      } finally {
        setLoading("fetchingSizes", false);
      }
    },
    [setLoading]
  );

  const submitUserMapping = useCallback(async () => {
    if (!state.csvFile) return;
    if (!guardEdits()) return;
    setLoading("uploadingMapping", true);
    try {
      const sessionId = await ensureSession();
      const normalized = await normalizeUserMappingFile(state.csvFile);
      const res = await uploadUserMapping(normalized, sessionId);
      const enriched = await enrichWithSizes(sessionId, res.mappings);

      setState((c) => ({
        ...c,
        userMappings: enriched,
      }));
      toast({ title: "User mapping uploaded", description: `${enriched.length} users saved to Flask.` });
    } catch (e) {
      toast({ title: "Could not upload user mapping", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("uploadingMapping", false);
    }
  }, [enrichWithSizes, ensureSession, guardEdits, setLoading, state.csvFile, toast]);

  const submitSharedDriveMapping = useCallback(async () => {
    if (!state.sharedDriveCsvFile) return;
    if (!guardEdits()) return;
    setLoading("uploadingSharedDrive", true);
    try {
      const sessionId = await ensureSession();
      const normalized = await normalizeSharedDriveFile(state.sharedDriveCsvFile);
      const res = await uploadSharedDriveMapping(normalized, sessionId);

      setState((c) => ({ ...c, sharedDriveMappings: res.mappings }));
      toast({ title: "Shared Drive mapping uploaded", description: `${res.mappings.length} drives saved to Flask.` });
    } catch (e) {
      toast({ title: "Could not upload shared drive mapping", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("uploadingSharedDrive", false);
    }
  }, [ensureSession, guardEdits, setLoading, state.sharedDriveCsvFile, toast]);

  const completeMappingStep = useCallback(() => {
    if (!guardEdits()) return;
    const { scope } = state.migrationConfig;
    const myDriveOk = scope === "shared-drives" || state.userMappings.length > 0;
    const sharedOk = scope === "my-drive" || state.sharedDriveMappings.length > 0;
    if (!myDriveOk || !sharedOk) {
      toast({ title: "Mappings missing", description: "Upload all required CSV files first.", variant: "destructive" });
      return;
    }

    setState((c) => ({
      ...c,
      completedSteps: markStepCompleted(c.completedSteps, 2),
      currentStep: 3,
    }));
  }, [guardEdits, state.migrationConfig, state.sharedDriveMappings.length, state.userMappings.length, toast]);

  // ─── Step 4: Migration mode ─────────────────────────────────────────────────

  const submitMigrationMode = useCallback(async () => {
    if (!guardEdits()) return;
    setLoading("savingMode", true);
    try {
      const sessionId = await ensureSession();
      await saveMigrationMode(state.migrationConfig.mode, sessionId);
      setState((c) => ({
        ...c,
        completedSteps: markStepCompleted(c.completedSteps, 3),
        currentStep: 4,
      }));
      toast({ title: "Migration mode saved", description: "Stored in Flask." });
    } catch (e) {
      toast({ title: "Could not save migration mode", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("savingMode", false);
    }
  }, [ensureSession, guardEdits, setLoading, state.migrationConfig.mode, toast]);

  // ─── Step 5: Scan + Execute ─────────────────────────────────────────────────

  const runPreScan = useCallback(async () => {
    if (!guardEdits()) return;
    setLoading("scanning", true);
    try {
      const sessionId = await ensureSession();
      const summary = await runScan(sessionId);
      setState((c) => ({ ...c, scan: summary }));
      toast({
        title: "Scan complete",
        description: `${summary.totalFiles.toLocaleString()} files • ${summary.totalSizeGb.toFixed(2)} GB`,
      });
    } catch (e) {
      toast({ title: "Scan failed", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("scanning", false);
    }
  }, [ensureSession, guardEdits, setLoading, toast]);

  const startMigrationRun = useCallback(async () => {
    if (!state.scan.scanned) {
      toast({ title: "Run a scan first", description: "Scanning is required before starting.", variant: "destructive" });
      return;
    }
    setLoading("startingMigration", true);
    try {
      const sessionId = await ensureSession();
      const migrationId =
        state.migrationConfig.mode === "resume" ? state.migrationConfig.resumeMigrationId?.trim() : undefined;
      const res = await startMigration(state.migrationConfig.mode, { sessionId, migrationId });

      completionNoticeRef.current = null;

      setState((c) => ({
        ...c,
        migrationProgress: {
          ...createInitialProgress(),
          migrationId: res.migrationId,
          status: "running",
          totalUsers: c.userMappings.length || c.sharedDriveMappings.length,
          logs: [`[INFO] Migration queued with id=${res.migrationId}`],
        },
      }));
      toast({ title: "Migration started", description: `Migration ${res.migrationId} is running.` });
    } catch (e) {
      toast({ title: "Could not start migration", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("startingMigration", false);
    }
  }, [ensureSession, setLoading, state.migrationConfig.mode, state.migrationConfig.resumeMigrationId, state.scan.scanned, state.userMappings.length, state.sharedDriveMappings.length, toast]);

  // ─── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.migrationProgress.status !== "running" || !state.migrationProgress.migrationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getMigrationStatus(state.migrationProgress.migrationId);
        if (cancelled) return;
        const nextStatus = res.status as MigrationProgress["status"];
        const isDone = nextStatus === "completed" || nextStatus === "failed";
        const toastKey = `${state.migrationProgress.migrationId}:${nextStatus}`;

        setState((c) => ({
          ...c,
          migrationProgress: {
            ...c.migrationProgress,
            migrationId: res.migrationId ?? c.migrationProgress.migrationId,
            status: nextStatus,
            totalUsers: res.totalUsers,
            filesMigrated: res.filesMigrated,
            failedFiles: res.failedFiles,
            logs: res.logs.length > 0 ? res.logs : c.migrationProgress.logs,
          },
          completedSteps: isDone ? markStepCompleted(c.completedSteps, 4) : c.completedSteps,
        }));

        if (isDone && completionNoticeRef.current !== toastKey) {
          completionNoticeRef.current = toastKey;
          toast({
            title: nextStatus === "completed" ? "Migration complete" : "Migration finished with errors",
            description: nextStatus === "completed"
              ? "Review logs and download the report."
              : "Review the logs and retry failed files if needed.",
            variant: nextStatus === "completed" ? "default" : "destructive",
          });
        }
      } catch (e) {
        if (cancelled) return;
        toast({ title: "Status refresh failed", description: getErrorMessage(e), variant: "destructive" });
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [state.migrationProgress.migrationId, state.migrationProgress.status, toast]);

  // ─── Step 6: Reports & retry ────────────────────────────────────────────────

  const downloadMigrationReport = useCallback(async () => {
    if (!state.migrationProgress.migrationId) return;
    setLoading("downloadingReport", true);
    try {
      const blob = await downloadReport(state.migrationProgress.migrationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `migration-report-${state.migrationProgress.migrationId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Could not download report", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("downloadingReport", false);
    }
  }, [setLoading, state.migrationProgress.migrationId, toast]);

  const retryFailedItems = useCallback(async () => {
    if (!state.migrationProgress.migrationId) return;
    setLoading("retrying", true);
    try {
      await retryFailed(state.migrationProgress.migrationId);
      completionNoticeRef.current = null;
      setState((c) => ({
        ...c,
        currentStep: 4,
        completedSteps: c.completedSteps.filter((v) => v < 4),
        migrationProgress: {
          ...c.migrationProgress,
          status: "running",
          logs: [...c.migrationProgress.logs, "[INFO] Retry requested from the UI."],
        },
      }));
      toast({ title: "Retry started" });
    } catch (e) {
      toast({ title: "Retry failed", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("retrying", false);
    }
  }, [setLoading, state.migrationProgress.migrationId, toast]);

  return {
    state,
    isMigrationRunning,
    maxAccessibleStep,
    loadingStates,
    goBack,
    goToStep,
    updateDomainConfig,
    updateMigrationConfig,
    updateCsvFile,
    updateUserMappings,
    updateSharedDriveCsvFile,
    updateSharedDriveMappings,
    submitDomainConfig,
    runValidation,
    submitUserMapping,
    submitSharedDriveMapping,
    completeMappingStep,
    submitMigrationMode,
    runPreScan,
    startMigrationRun,
    downloadMigrationReport,
    retryFailedItems,
  };
};
