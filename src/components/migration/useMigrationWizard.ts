import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMigrationSession,
  downloadReport,
  fetchStorageSizes,
  fetchSharedDriveStorageSizes,
  getMigrationStatus,
  getSharedDriveMigrationStatus,
  getSharedDriveStreamToken,
  retryFailed,
  saveConfig,
  saveMigrationMode,
  startDiscovery,
  startSharedDriveDiscovery,
  totalsToScanSummary,
  startMigrationFresh,
  startSharedDriveMigration,
  resumeMigration,
  resumeSharedDriveMigration,
  uploadSharedDriveMapping,
  uploadUserMapping,
  runPreflight,
  getStreamToken,
  getCurrentConfig,
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

const modeToScope = (mode?: string): WizardState["migrationConfig"]["scope"] | null => {
  if (mode === "shared-drives") return "shared-drives";
  if (mode === "full") return "both";
  if (mode === "custom") return "my-drive";
  return null;
};

// ─── SSE helpers (migration only) ────────────────────────────────────────────

async function openAuthenticatedStream(
  url: string,
  handlers: {
    onProgress?: (data: unknown) => void;
    onPhase?: (data: unknown) => void;
    onDone: (data: unknown) => void;
    onError: (err: Error) => void;
  },
  signal: { cancelled: boolean },
): Promise<EventSource> {
  const es = new EventSource(url);

  let cleanClose = false;

  es.addEventListener("progress", (ev: MessageEvent) => {
    if (signal.cancelled) return;
    try { handlers.onProgress?.(JSON.parse(ev.data)); } catch { /* noop */ }
  });

  es.addEventListener("phase", (ev: MessageEvent) => {
    if (signal.cancelled) return;
    try { handlers.onPhase?.(JSON.parse(ev.data)); } catch { /* noop */ }
  });

  es.addEventListener("done", (ev: MessageEvent) => {
    if (signal.cancelled) return;
    cleanClose = true;
    try { handlers.onDone(JSON.parse(ev.data)); } catch { handlers.onDone({}); }
    es.close();
  });

  es.addEventListener("error", (ev: MessageEvent) => {
    if (signal.cancelled) return;
    cleanClose = true;
    handlers.onError(new Error((ev as any).data ?? "SSE server error event"));
    es.close();
  });

  es.onerror = () => {
    if (signal.cancelled) return;
    if (cleanClose) return;
    handlers.onError(new Error("SSE connection dropped unexpectedly"));
    es.close();
  };

  return es;
}

// ─── Persistence: keep wizard inputs across reload / logout ─────────────────
// File objects can't be JSON-serialized — they're rebuilt from the backend
// (uploads/credential/*.json + uploads/users.csv stay on disk until DELETE
// /api/reset).  Everything else (domain, emails, mappings, scope, runId)
// goes into localStorage.

const STORAGE_KEY = "gws_wizard_state_v1";

type PersistableState = Omit<
  WizardState,
  "csvFile" | "sharedDriveCsvFile" | "domainConfig"
> & {
  domainConfig: Omit<DomainConfig, "sourceCredentials" | "destinationCredentials">;
  runId?: string;
};

const loadPersisted = (): { state: Partial<WizardState>; runId: string } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistableState;
    return {
      state: {
        ...parsed,
        domainConfig: {
          ...initialState.domainConfig,
          ...parsed.domainConfig,
          sourceCredentials: null,
          destinationCredentials: null,
        },
        csvFile: null,
        sharedDriveCsvFile: null,
      },
      runId: parsed.runId ?? "",
    };
  } catch {
    return null;
  }
};

const persist = (state: WizardState, runId: string) => {
  try {
    const { csvFile, sharedDriveCsvFile, domainConfig, ...rest } = state;
    const payload: PersistableState = {
      ...rest,
      domainConfig: {
        sourceDomain: domainConfig.sourceDomain,
        sourceAdminEmail: domainConfig.sourceAdminEmail,
        destinationDomain: domainConfig.destinationDomain,
        destinationAdminEmail: domainConfig.destinationAdminEmail,
      },
      runId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded — ignore */
  }
};

export const clearPersistedWizardState = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

export const useMigrationWizard = () => {
  const [state, setState] = useState<WizardState>(() => {
    const persisted = loadPersisted();
    return persisted ? { ...initialState, ...persisted.state } : initialState;
  });
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
    syncing: false,
    resuming: false,
  });
  const { toast } = useToast();
  const completionNoticeRef = useRef<string | null>(null);

  const freshCredsRef = useRef<{ source: boolean; destination: boolean }>({
    source: false,
    destination: false,
  });

  const configSavedRef = useRef(false);
  const runIdRef = useRef<string>(loadPersisted()?.runId ?? "");

  // Migration SSE refs (discovery no longer uses SSE)
  const migrationTokenRef  = useRef<string | null>(null);
  const migrationEsRef = useRef<EventSource | null>(null);

  // Persist serializable wizard state on every change
  useEffect(() => {
    persist(state, runIdRef.current);
  }, [state]);

  // Rehydrate domain config + last run id from backend on mount
  // (covers the case where localStorage was cleared but the Flask session
  // still has the persisted config on disk)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getCurrentConfig();
        if (!cfg || cancelled) return;
        if (cfg.sourceCredExists || cfg.destCredExists) configSavedRef.current = true;
        const backendScope = modeToScope(cfg.migrationMode);
        const persistedScope = backendScope ?? state.migrationConfig.scope;
        const configRunId = persistedScope === "shared-drives"
          ? (cfg.lastSdDiscoveryRunId || cfg.lastDiscoveryRunId)
          : cfg.lastDiscoveryRunId;
        if (persistedScope === "shared-drives" && cfg.lastSdDiscoveryRunId) {
          runIdRef.current = cfg.lastSdDiscoveryRunId;
        } else if (configRunId && !runIdRef.current) {
          runIdRef.current = configRunId;
        }
        const currentRunId = persistedScope === "shared-drives"
          ? (cfg.lastSdDiscoveryRunId || state.migrationProgress.migrationId || runIdRef.current || configRunId)
          : (state.migrationProgress.migrationId || runIdRef.current || configRunId);
        const isSharedDrive = persistedScope === "shared-drives";
        const serverProgress = currentRunId
          ? await (isSharedDrive
              ? getSharedDriveMigrationStatus(currentRunId)
              : getMigrationStatus(currentRunId)
            ).catch(() => null)
          : null;

        setState((c) => {
          const staleRunning = c.migrationProgress.status === "running" && !cfg.migrationActive;
          const nextProgress = serverProgress
            ? {
                ...c.migrationProgress,
                ...serverProgress,
                status: serverProgress.status === "running" && !cfg.migrationActive ? "failed" : serverProgress.status,
                logs: staleRunning
                  ? [...c.migrationProgress.logs, "[WARN] Backend is not actively migrating. UI unlocked — use Resume to continue this run."]
                  : c.migrationProgress.logs,
              }
            : staleRunning
              ? {
                  ...c.migrationProgress,
                  status: c.migrationProgress.migrationId ? "failed" : "pending",
                  logs: [...c.migrationProgress.logs, "[WARN] Backend is not actively migrating. UI unlocked — use Resume to continue this run."],
                }
              : c.migrationProgress;

          return {
          ...c,
          sessionId: cfg.sessionId || c.sessionId,
          domainConfig: {
            ...c.domainConfig,
            sourceDomain: c.domainConfig.sourceDomain || cfg.sourceDomain,
            sourceAdminEmail: c.domainConfig.sourceAdminEmail || cfg.sourceAdminEmail,
            destinationDomain: c.domainConfig.destinationDomain || cfg.destinationDomain,
            destinationAdminEmail: c.domainConfig.destinationAdminEmail || cfg.destinationAdminEmail,
          },
          migrationProgress: nextProgress,
          migrationConfig: backendScope
            ? { ...c.migrationConfig, scope: backendScope, mode: scopeToMode(backendScope) }
            : c.migrationConfig,
        };
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
        if (config.sourceCredentials && config.sourceCredentials !== c.domainConfig.sourceCredentials) {
          freshCredsRef.current.source = true;
        }
        if (config.destinationCredentials && config.destinationCredentials !== c.domainConfig.destinationCredentials) {
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
      const nextMode = config.mode === "resume" ? "resume" : scopeToMode(config.scope);
      setState((c) => ({
        ...invalidateFromStep(c.currentStep >= 3 ? 3 : 2)(c),
        migrationConfig: { ...config, mode: nextMode },
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

  const ensureRunId = useCallback(() => {
    if (!runIdRef.current) {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      runIdRef.current = `run_${ts}`;
    }
    return runIdRef.current;
  }, []);

  const resetRunId = useCallback(() => {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    runIdRef.current = `run_${ts}`;
    return runIdRef.current;
  }, []);

  const buildUserMapping = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const m of state.userMappings) {
      if (m.sourceUser && m.destinationUser) map[m.sourceUser] = m.destinationUser;
    }
    return map;
  }, [state.userMappings]);

  const buildDriveIdMapping = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const m of state.sharedDriveMappings) {
      if (m.sourceDriveId && m.destinationDriveId) map[m.sourceDriveId] = m.destinationDriveId;
    }
    return map;
  }, [state.sharedDriveMappings]);

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

      if (state.domainConfig.sourceCredentials && freshCredsRef.current.source) {
        fd.append("sourceCredentials", state.domainConfig.sourceCredentials);
      }
      if (state.domainConfig.destinationCredentials && freshCredsRef.current.destination) {
        fd.append("destinationCredentials", state.domainConfig.destinationCredentials);
      }

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

      setState((c) => ({ ...c, userMappings: enriched }));
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

      // Enrich with storage sizes from the SD endpoint
      const rawMappings = res.mappings ?? [];
      let enriched: SharedDriveMappingRow[] = rawMappings;
      try {
        setLoading("fetchingSizes", true);
        const rows = await fetchSharedDriveStorageSizes(
          rawMappings.map((m) => ({
            source_drive_id: m.sourceDriveId,
            dest_drive_id: m.destinationDriveId,
          })),
          sessionId,
        );
        const sizeBySrc = new Map(rows.map((r) => [r.source_drive_id, r]));
        enriched = rawMappings.map((m) => {
          const r = sizeBySrc.get(m.sourceDriveId);
          return {
            ...m,
            sourceSizeGb: r?.source_total_gb ?? null,
            destinationSizeGb: r?.dest_total_gb ?? null,
          };
        });
      } catch (err) {
        console.warn("[shared-drive sizes]", err);
      } finally {
        setLoading("fetchingSizes", false);
      }

      setState((c) => ({ ...c, sharedDriveMappings: enriched }));
      toast({ title: "Shared Drive mapping uploaded", description: `${enriched.length} drives saved to Flask.` });
    } catch (e) {
      toast({ title: "Could not upload shared drive mapping", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("uploadingSharedDrive", false);
    }
  }, [ensureSession, guardEdits, setLoading, state.sharedDriveCsvFile, toast]);

  const completeMappingStep = useCallback(() => {
    if (!guardEdits()) return;
    const { scope } = state.migrationConfig;

    const hasUserMappings   = state.userMappings.length > 0;
    const hasSharedMappings = state.sharedDriveMappings.length > 0;

    // At least one mapping must be uploaded
    if (!hasUserMappings && !hasSharedMappings) {
      toast({
        title: "Mappings missing",
        description: "Upload at least one CSV file (user mapping or shared drive mapping).",
        variant: "destructive",
      });
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

  // ─── Step 5: Pre-scan (Discovery) ──────────────────────────────────────────
  // Simple: POST /api/discovery/start, await the response, done.
  // No SSE, no polling, no token management.

  const runPreScan = useCallback(async () => {
    if (!guardEdits()) return;
    if (state.migrationConfig.mode === "resume") {
      toast({ title: "Resume selected", description: "Select Save & Continue, then start the resume from the execution step." });
      return;
    }

    const scope = state.migrationConfig.scope;
    const userMapping = buildUserMapping();
    const driveMapping = buildDriveIdMapping();

    const wantMyDrive = scope === "my-drive" || scope === "both";
    const wantSharedDrives = scope === "shared-drives" || scope === "both";

    if (wantMyDrive && Object.keys(userMapping).length === 0) {
      toast({ title: "No users to scan", description: "Upload a user mapping first.", variant: "destructive" });
      return;
    }
    if (wantSharedDrives && Object.keys(driveMapping).length === 0) {
      toast({ title: "No shared drives to scan", description: "Upload a shared drive mapping first.", variant: "destructive" });
      return;
    }

    setLoading("scanning", true);
    const runId = resetRunId();

    try {
      const sessionId = await ensureSession();

      let totalFiles = 0;
      let totalFolders = 0;
      let totalSizeBytes = 0;

      if (wantMyDrive) {
        const { totals } = await startDiscovery({ runId, userMapping, sessionId });
        totalFiles += totals.total_files;
        totalFolders += totals.total_folders;
        totalSizeBytes += totals.total_size_bytes;
      }

      if (wantSharedDrives) {
        const { totals } = await startSharedDriveDiscovery({
          runId,
          driveIdMapping: driveMapping,
          sessionId,
        });
        totalFiles += totals.total_files;
        totalFolders += totals.total_folders;
        totalSizeBytes += totals.total_size_bytes;
      }

      const scan = totalsToScanSummary({
        total_users: 0,
        completed_users: 0,
        failed_users: 0,
        total_files: totalFiles,
        total_folders: totalFolders,
        total_size_bytes: totalSizeBytes,
      });
      setState((c) => ({ ...c, scan }));

      toast({
        title: "Scan complete",
        description: `${scan.totalFiles.toLocaleString()} files • ${scan.totalSizeGb.toFixed(2)} GB`,
      });
    } catch (e) {
      toast({ title: "Scan failed", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("scanning", false);
    }
  }, [buildDriveIdMapping, buildUserMapping, ensureSession, guardEdits, resetRunId, setLoading, state.migrationConfig.mode, state.migrationConfig.scope, toast]);

  // ─── Step 5: Start / Resume migration ──────────────────────────────────────

  const startMigrationRun = useCallback(async () => {
    if (!state.scan.scanned) {
      toast({ title: "Run a scan first", description: "Scanning is required before starting.", variant: "destructive" });
      return;
    }
    setLoading("startingMigration", true);
    try {
      await ensureSession();
      const runId = ensureRunId();
      const scope = state.migrationConfig.scope;

      let resolvedRunId = runId;
      let totalUsers = 0;

      if (scope === "shared-drives") {
        const res = await startSharedDriveMigration({ runId, driveIdMapping: buildDriveIdMapping() });
        resolvedRunId = res.run_id;
        totalUsers = state.sharedDriveMappings.length;
      } else {
        const res = await startMigrationFresh({ runId, userMapping: buildUserMapping() });
        resolvedRunId = res.run_id;
        totalUsers = res.total_users || state.userMappings.length;

        // For "both", also kick off the SD migration on the same run_id
        if (scope === "both" && state.sharedDriveMappings.length > 0) {
          try {
            await startSharedDriveMigration({ runId: resolvedRunId, driveIdMapping: buildDriveIdMapping() });
          } catch (err) {
            console.warn("[shared-drive start (both)]", err);
          }
        }
      }

      completionNoticeRef.current = null;
      migrationTokenRef.current = null;

      setState((c) => ({
        ...c,
        migrationProgress: {
          ...createInitialProgress(),
          migrationId: resolvedRunId,
          status: "running",
          totalUsers,
          dataTotalGb: c.scan.totalSizeGb,
          filesTotal: c.scan.totalFiles,
          logs: [`[INFO] Migration queued with id=${resolvedRunId}`],
        },
      }));
      toast({ title: "Migration started", description: `Migration ${resolvedRunId} is running.` });
    } catch (e) {
      toast({ title: "Could not start migration", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("startingMigration", false);
    }
  }, [buildDriveIdMapping, buildUserMapping, ensureRunId, ensureSession, setLoading, state.migrationConfig.scope, state.scan.scanned, state.sharedDriveMappings.length, state.userMappings.length, toast]);

  const resumeRun = useCallback(async (runId: string) => {
    if (!runId) {
      toast({ title: "Pick a run", description: "Select a previous run to resume.", variant: "destructive" });
      return;
    }
    setLoading("resuming", true);
    try {
      await ensureSession();
      const scope = state.migrationConfig.scope;

      let resolvedRunId = runId;
      let totalUsers = 0;
      let pendingFiles = 0;
      let doneFiles = 0;

      if (scope === "shared-drives") {
        const res = await resumeSharedDriveMigration({ runId });
        resolvedRunId = res.run_id;
      } else {
        const res = await resumeMigration({ runId });
        resolvedRunId = res.run_id;
        totalUsers = res.total_users || 0;
        pendingFiles = res.pending_files || 0;
        doneFiles = res.done_files || 0;

        if (scope === "both") {
          try {
            await resumeSharedDriveMigration({ runId: resolvedRunId });
          } catch (err) {
            console.warn("[shared-drive resume (both)]", err);
          }
        }
      }

      runIdRef.current = resolvedRunId;
      completionNoticeRef.current = null;
      migrationTokenRef.current = null;

      setState((c) => ({
        ...c,
        migrationProgress: {
          ...createInitialProgress(),
          migrationId: resolvedRunId,
          status: "running",
          totalUsers,
          filesDone: doneFiles,
          filesTotal: pendingFiles + doneFiles,
          logs: [
            `[INFO] Resuming migration ${resolvedRunId}`,
            scope === "shared-drives"
              ? `[INFO] Resuming shared drive migration`
              : `[INFO] ${pendingFiles} pending · ${doneFiles} already done`,
          ],
        },
      }));
      toast({ title: "Migration resumed", description: `Migration ${resolvedRunId} is running.` });
    } catch (e) {
      toast({ title: "Could not resume migration", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("resuming", false);
    }
  }, [ensureSession, setLoading, state.migrationConfig.scope, toast]);

  const syncStatus = useCallback(async () => {
    const id = state.migrationProgress.migrationId || runIdRef.current;
    if (!id) {
      toast({ title: "No active migration", description: "Start or resume a migration first." });
      return;
    }
    setLoading("syncing", true);
    try {
      const isSharedDrive = state.migrationConfig.scope === "shared-drives";
      const res = isSharedDrive
        ? await getSharedDriveMigrationStatus(id)
        : await getMigrationStatus(id);
      setState((c) => ({
        ...c,
        migrationProgress: {
          ...c.migrationProgress,
          migrationId: res.migrationId,
          status: res.status,
          totalUsers: res.totalUsers || c.migrationProgress.totalUsers,
          filesMigrated: res.filesMigrated || c.migrationProgress.filesMigrated,
          failedFiles: res.failedFiles || c.migrationProgress.failedFiles,
          filesDone: res.filesDone || c.migrationProgress.filesDone,
          filesTotal: res.filesTotal || c.migrationProgress.filesTotal,
          dataTransferredGb: res.dataTransferredGb || c.migrationProgress.dataTransferredGb,
          dataTotalGb: res.dataTotalGb || c.migrationProgress.dataTotalGb,
        },
      }));
      toast({ title: "Synced", description: `Status: ${res.status}` });
    } catch (e) {
      toast({ title: "Sync failed", description: getErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading("syncing", false);
    }
  }, [setLoading, state.migrationProgress.migrationId, state.migrationConfig.scope, toast]);

  // ─── Live progress: SSE for migration logs/phase ────────────────────────────

  useEffect(() => {
    if (state.migrationProgress.status !== "running" || !state.migrationProgress.migrationId) return;
    if (migrationEsRef.current) return;

    const runId = state.migrationProgress.migrationId;
    const signal = { cancelled: false };

    const appendLog = (line: string) =>
      setState((c) => ({
        ...c,
        migrationProgress: {
          ...c.migrationProgress,
          logs: [...c.migrationProgress.logs, line].slice(-500),
        },
      }));

    (async () => {
      try {
        const isSharedDrive = state.migrationConfig.scope === "shared-drives";
        if (!migrationTokenRef.current) {
          migrationTokenRef.current = isSharedDrive
            ? await getSharedDriveStreamToken(runId)
            : await getStreamToken(runId);
        }
        if (signal.cancelled) return;

        // ✅ ADD THIS GUARD — abort if token fetch silently returned null/undefined
        if (!migrationTokenRef.current) {
          console.warn("[migration SSE] No stream token — skipping SSE, polling will cover status.");
          return;
        }

        const url = buildApiUrl(
          isSharedDrive
            ? `/api/shared-drive/migrate/stream?run_id=${encodeURIComponent(runId)}&token=${encodeURIComponent(migrationTokenRef.current)}`
            : `/api/migration/stream?run_id=${encodeURIComponent(runId)}&stream_token=${encodeURIComponent(migrationTokenRef.current)}`,
        );

        const es = await openAuthenticatedStream(
          url,
          {
            onPhase: (d: any) => appendLog(`[PHASE] ${d.phase ?? ""}`),
            onProgress: (d: any) => {
              const tag = d.success ? "OK" : d.skipped ? "SKIP" : d.ignored ? "IGN" : "FAIL";
              appendLog(`[${tag}] ${d.source_email ?? ""} • ${d.file_name ?? ""}${d.error ? ` — ${d.error}` : ""}`);
              if (d.totals) {
                setState((c) => ({
                  ...c,
                  migrationProgress: {
                    ...c.migrationProgress,
                    filesMigrated: d.totals.files_migrated ?? c.migrationProgress.filesMigrated,
                    failedFiles:   d.totals.files_failed   ?? c.migrationProgress.failedFiles,
                  },
                }));
              }
            },
            onDone: () => appendLog("[DONE] Migration finished"),
            onError: () => { /* polling below handles status */ },
          },
          signal,
        );
        migrationEsRef.current = es;
      } catch {
        // Token fetch failed — polling fallback still updates status
      }
    })();

    return () => {
      signal.cancelled = true;
      migrationEsRef.current?.close();
      migrationEsRef.current = null;
    };
  }, [state.migrationProgress.migrationId, state.migrationProgress.status, state.migrationConfig.scope]);

  useEffect(() => {
    if (state.migrationProgress.status === "running") return;
    migrationEsRef.current?.close();
    migrationEsRef.current = null;
    migrationTokenRef.current = null;
  }, [state.migrationProgress.status]);

  // ─── Polling: authoritative migration status ────────────────────────────────

  useEffect(() => {
    if (state.migrationProgress.status !== "running" || !state.migrationProgress.migrationId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const isSharedDrive = state.migrationConfig.scope === "shared-drives";
        const res = isSharedDrive
          ? await getSharedDriveMigrationStatus(state.migrationProgress.migrationId)
          : await getMigrationStatus(state.migrationProgress.migrationId);
        if (cancelled) return;
        const nextStatus = res.status as MigrationProgress["status"];
        const isDone = nextStatus === "completed" || nextStatus === "failed";
        const toastKey = `${state.migrationProgress.migrationId}:${nextStatus}`;

        setState((c) => ({
          ...c,
          migrationProgress: {
            ...c.migrationProgress,
            migrationId:   res.migrationId   ?? c.migrationProgress.migrationId,
            status:        nextStatus,
            totalUsers:    res.totalUsers    || c.migrationProgress.totalUsers,
            filesMigrated: res.filesMigrated || c.migrationProgress.filesMigrated,
            failedFiles:   res.failedFiles   || c.migrationProgress.failedFiles,
            filesDone:     res.filesDone     || c.migrationProgress.filesDone,
            filesTotal:    res.filesTotal    || c.migrationProgress.filesTotal,
            dataTransferredGb: res.dataTransferredGb || c.migrationProgress.dataTransferredGb,
            dataTotalGb:   res.dataTotalGb   || c.migrationProgress.dataTotalGb,
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
        console.warn("[migration poll]", getErrorMessage(e));
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [state.migrationProgress.migrationId, state.migrationProgress.status, state.migrationConfig.scope, toast]);

  // ─── Step 6: Reports & retry ────────────────────────────────────────────────

  const downloadMigrationReport = useCallback(async () => {
    if (!state.migrationProgress.migrationId) return;
    setLoading("downloadingReport", true);
    try {
      const blob = await downloadReport(state.migrationProgress.migrationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `migration-${state.migrationProgress.migrationId}-sql-export.zip`;
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

      migrationEsRef.current?.close();
      migrationEsRef.current = null;
      migrationTokenRef.current = null;

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
    resumeRun,
    syncStatus,
    downloadMigrationReport,
    retryFailedItems,
  };
};
