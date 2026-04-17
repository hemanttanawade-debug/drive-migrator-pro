import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMigrationSession,
  downloadReport,
  getMigrationStatus,
  retryFailed,
  saveConfig,
  saveMigrationMode,
  startMigration,
  uploadUserMapping,
  validateConnection,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { ConnectionStatus, DomainConfig, MigrationConfig, MigrationProgress, UserMapping, WizardState } from "@/types/migration";
import { normalizeUserMappingFile } from "./user-mapping-utils";

const TOTAL_STEPS = 6;

const createPendingConnectionStatus = (): ConnectionStatus => ({
  source: "pending",
  destination: "pending",
});

const createInitialProgress = (): MigrationProgress => ({
  migrationId: "",
  status: "pending",
  totalUsers: 0,
  filesMigrated: 0,
  failedFiles: 0,
  logs: [],
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
  csvFile: null,
  connectionStatus: createPendingConnectionStatus(),
  migrationConfig: { mode: "full" },
  migrationProgress: createInitialProgress(),
};

const markStepCompleted = (steps: number[], step: number) =>
  Array.from(new Set([...steps, step])).sort((left, right) => left - right);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const parseValidationErrors = (errors?: string[]) => {
  const result: Pick<ConnectionStatus, "sourceError" | "destinationError"> = {};

  errors?.forEach((error) => {
    if (error.startsWith("Source:")) {
      result.sourceError = error.replace(/^Source:\s*/, "");
      return;
    }

    if (error.startsWith("Destination:")) {
      result.destinationError = error.replace(/^Destination:\s*/, "");
      return;
    }

    result.sourceError = result.sourceError ?? error;
    result.destinationError = result.destinationError ?? error;
  });

  return result;
};

export const useMigrationWizard = () => {
  const [state, setState] = useState<WizardState>(initialState);
  const [loadingStates, setLoadingStates] = useState({
    savingConfig: false,
    uploadingMapping: false,
    savingMode: false,
    startingMigration: false,
    downloadingReport: false,
    retrying: false,
  });
  const { toast } = useToast();
  const completionNoticeRef = useRef<string | null>(null);

  const setLoading = useCallback(
    (key: keyof typeof loadingStates, value: boolean) => {
      setLoadingStates((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const maxAccessibleStep = useMemo(() => {
    let unlockedStep = 0;

    while (unlockedStep < TOTAL_STEPS - 1 && state.completedSteps.includes(unlockedStep)) {
      unlockedStep += 1;
    }

    return unlockedStep;
  }, [state.completedSteps]);

  const goToStep = useCallback(
    (step: number) => {
      setState((current) => ({
        ...current,
        currentStep: step <= maxAccessibleStep ? step : current.currentStep,
      }));
    },
    [maxAccessibleStep]
  );

  const goBack = useCallback(() => {
    setState((current) => ({
      ...current,
      currentStep: Math.max(0, current.currentStep - 1),
    }));
  }, []);

  const invalidateFromStep = useCallback((step: number) => {
    return (current: WizardState): WizardState => ({
      ...current,
      currentStep: Math.min(current.currentStep, step),
      completedSteps: current.completedSteps.filter((value) => value < step),
      connectionStatus: step <= 2 ? createPendingConnectionStatus() : current.connectionStatus,
      migrationProgress: step <= 4 ? createInitialProgress() : current.migrationProgress,
    });
  }, []);

  const updateDomainConfig = useCallback(
    (config: DomainConfig) => {
      setState((current) => ({
        ...invalidateFromStep(0)(current),
        domainConfig: config,
      }));
    },
    [invalidateFromStep]
  );

  const updateCsvFile = useCallback(
    (file: File | null) => {
      setState((current) => ({
        ...invalidateFromStep(1)(current),
        csvFile: file,
        userMappings: file ? current.userMappings : [],
      }));
    },
    [invalidateFromStep]
  );

  const updateUserMappings = useCallback(
    (mappings: UserMapping[]) => {
      setState((current) => ({
        ...invalidateFromStep(1)(current),
        userMappings: mappings,
      }));
    },
    [invalidateFromStep]
  );

  const updateMigrationConfig = useCallback(
    (config: MigrationConfig) => {
      setState((current) => ({
        ...invalidateFromStep(3)(current),
        migrationConfig: config,
      }));
    },
    [invalidateFromStep]
  );

  const ensureSession = useCallback(async () => {
    if (state.sessionId) return state.sessionId;

    const response = await createMigrationSession();
    setState((current) => ({ ...current, sessionId: response.sessionId }));
    return response.sessionId;
  }, [state.sessionId]);

  const submitDomainConfig = useCallback(async () => {
    setLoading("savingConfig", true);

    try {
      const sessionId = await ensureSession();
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("sourceDomain", state.domainConfig.sourceDomain.trim());
      formData.append("sourceAdminEmail", state.domainConfig.sourceAdminEmail.trim());
      formData.append("destinationDomain", state.domainConfig.destinationDomain.trim());
      formData.append("destinationAdminEmail", state.domainConfig.destinationAdminEmail.trim());

      if (state.domainConfig.sourceCredentials) {
        formData.append("sourceCredentials", state.domainConfig.sourceCredentials);
      }

      if (state.domainConfig.destinationCredentials) {
        formData.append("destinationCredentials", state.domainConfig.destinationCredentials);
      }

      const response = await saveConfig(formData);

      setState((current) => ({
        ...current,
        sessionId: response.sessionId,
        completedSteps: markStepCompleted(current.completedSteps, 0),
        currentStep: 1,
      }));

      toast({ title: "Configuration saved", description: "Domain settings were stored in Flask." });
    } catch (error) {
      toast({
        title: "Could not save configuration",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading("savingConfig", false);
    }
  }, [ensureSession, setLoading, state.domainConfig, toast]);

  const submitUserMapping = useCallback(async () => {
    if (!state.csvFile) return;

    setLoading("uploadingMapping", true);

    try {
      const sessionId = await ensureSession();
      const normalizedFile = await normalizeUserMappingFile(state.csvFile);
      const response = await uploadUserMapping(normalizedFile, sessionId);

      setState((current) => ({
        ...current,
        completedSteps: markStepCompleted(current.completedSteps, 1),
        userMappings: response.mappings,
        currentStep: 2,
      }));

      toast({ title: "User mapping uploaded", description: "users.csv was saved to the Flask uploads folder." });
    } catch (error) {
      toast({
        title: "Could not upload user mapping",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading("uploadingMapping", false);
    }
  }, [ensureSession, setLoading, state.csvFile, toast]);

  const runValidation = useCallback(async () => {
    try {
      const sessionId = await ensureSession();
      const response = await validateConnection(sessionId);
      const nextStatus: ConnectionStatus = {
        source: response.source ? "success" : "error",
        destination: response.destination ? "success" : "error",
        ...parseValidationErrors(response.errors),
      };
      const isValid = response.source && response.destination;

      setState((current) => ({
        ...current,
        connectionStatus: nextStatus,
        completedSteps: isValid
          ? markStepCompleted(current.completedSteps, 2)
          : current.completedSteps.filter((value) => value < 2),
      }));

      toast({
        title: isValid ? "Connection validated" : "Validation failed",
        description: isValid
          ? "Both source and destination domains responded successfully."
          : response.errors?.[0] || "Please review the reported connection errors.",
        variant: isValid ? "default" : "destructive",
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        connectionStatus: {
          source: "error",
          destination: "error",
          sourceError: getErrorMessage(error),
          destinationError: getErrorMessage(error),
        },
        completedSteps: current.completedSteps.filter((value) => value < 2),
      }));

      toast({
        title: "Validation failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }, [ensureSession, toast]);

  const submitMigrationMode = useCallback(async () => {
    setLoading("savingMode", true);

    try {
      const sessionId = await ensureSession();
      await saveMigrationMode(state.migrationConfig.mode, sessionId);

      setState((current) => ({
        ...current,
        completedSteps: markStepCompleted(current.completedSteps, 3),
        currentStep: 4,
      }));

      toast({ title: "Migration mode saved", description: "Selected mode was stored in Flask." });
    } catch (error) {
      toast({
        title: "Could not save migration mode",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading("savingMode", false);
    }
  }, [ensureSession, setLoading, state.migrationConfig.mode, toast]);

  const startMigrationRun = useCallback(async () => {
    setLoading("startingMigration", true);

    try {
      const sessionId = await ensureSession();
      const migrationId = state.migrationConfig.mode === "resume"
        ? state.migrationConfig.resumeMigrationId?.trim()
        : undefined;

      const response = await startMigration(state.migrationConfig.mode, {
        sessionId,
        migrationId,
      });

      completionNoticeRef.current = null;

      setState((current) => ({
        ...current,
        migrationProgress: {
          ...createInitialProgress(),
          migrationId: response.migrationId,
          status: "running",
          totalUsers: current.userMappings.length,
          logs: [`[INFO] Migration queued with id=${response.migrationId}`],
        },
      }));

      toast({ title: "Migration started", description: `Migration ${response.migrationId} is running.` });
    } catch (error) {
      toast({
        title: "Could not start migration",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading("startingMigration", false);
    }
  }, [ensureSession, setLoading, state.migrationConfig.mode, state.migrationConfig.resumeMigrationId, toast]);

  useEffect(() => {
    if (state.migrationProgress.status !== "running" || !state.migrationProgress.migrationId) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await getMigrationStatus(state.migrationProgress.migrationId);
        if (cancelled) return;

        const nextStatus = response.status as MigrationProgress["status"];
        const toastKey = `${state.migrationProgress.migrationId}:${nextStatus}`;
        const isDone = nextStatus === "completed" || nextStatus === "failed";

        setState((current) => ({
          ...current,
          migrationProgress: {
            ...current.migrationProgress,
            migrationId: response.migrationId ?? current.migrationProgress.migrationId,
            status: nextStatus,
            totalUsers: response.totalUsers,
            filesMigrated: response.filesMigrated,
            failedFiles: response.failedFiles,
            logs: response.logs.length > 0 ? response.logs : current.migrationProgress.logs,
          },
          completedSteps: isDone
            ? markStepCompleted(current.completedSteps, 4)
            : current.completedSteps,
        }));

        if (isDone && completionNoticeRef.current !== toastKey) {
          completionNoticeRef.current = toastKey;
          toast({
            title: nextStatus === "completed" ? "Migration complete" : "Migration finished with errors",
            description:
              nextStatus === "completed"
                ? "You can now review logs and download the report."
                : "Review the logs and retry failed files if needed.",
            variant: nextStatus === "completed" ? "default" : "destructive",
          });
        }
      } catch (error) {
        if (cancelled) return;

        toast({
          title: "Status refresh failed",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [state.migrationProgress.migrationId, state.migrationProgress.status, toast]);

  const downloadMigrationReport = useCallback(async () => {
    if (!state.migrationProgress.migrationId) return;

    setLoading("downloadingReport", true);

    try {
      const blob = await downloadReport(state.migrationProgress.migrationId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `migration-report-${state.migrationProgress.migrationId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Could not download report",
        description: getErrorMessage(error),
        variant: "destructive",
      });
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

      setState((current) => ({
        ...current,
        currentStep: 4,
        completedSteps: current.completedSteps.filter((value) => value < 4),
        migrationProgress: {
          ...current.migrationProgress,
          status: "running",
          logs: [...current.migrationProgress.logs, "[INFO] Retry requested from the UI."],
        },
      }));

      toast({ title: "Retry started", description: "Flask is retrying failed items now." });
    } catch (error) {
      toast({
        title: "Retry failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading("retrying", false);
    }
  }, [setLoading, state.migrationProgress.migrationId, toast]);

  return {
    state,
    maxAccessibleStep,
    loadingStates,
    goBack,
    goToStep,
    updateDomainConfig,
    updateCsvFile,
    updateUserMappings,
    updateMigrationConfig,
    submitDomainConfig,
    submitUserMapping,
    runValidation,
    submitMigrationMode,
    startMigrationRun,
    downloadMigrationReport,
    retryFailedItems,
  };
};