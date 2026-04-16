import { useAuth } from "@/context/AuthContext";
import { useState, useCallback } from "react";
import StepIndicator from "./StepIndicator";
import DomainConfigStep from "./steps/DomainConfigStep";
import UserMappingStep from "./steps/UserMappingStep";
import ValidationStep from "./steps/ValidationStep";
import MigrationModeStep from "./steps/MigrationModeStep";
import ExecutionStep from "./steps/ExecutionStep";
import LogsReportsStep from "./steps/LogsReportsStep";
import type { WizardState } from "@/types/migration";
import { useToast } from "@/hooks/use-toast";

const initialState: WizardState = {
  currentStep: 0,
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
  connectionStatus: { source: "pending", destination: "pending" },
  migrationConfig: { mode: "full" },
  migrationProgress: {
    migrationId: "",
    status: "pending",
    totalUsers: 0,
    filesMigrated: 0,
    failedFiles: 0,
    logs: [],
  },
};

const MigrationWizard = () => {
  const { user, logout } = useAuth();
  const [state, setState] = useState<WizardState>(initialState);
  const { toast } = useToast();

  const setStep = (step: number) => setState((s) => ({ ...s, currentStep: step }));
  const next = () => setStep(state.currentStep + 1);
  const back = () => setStep(state.currentStep - 1);

  const handleValidate = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 2000));
    setState((s) => ({
      ...s,
      connectionStatus: { source: "success", destination: "success" },
    }));
    toast({ title: "Connection validated", description: "Both domains connected successfully" });
  }, [toast]);

  const handleStartMigration = useCallback(async () => {
    const migrationId = `MIG-${Date.now().toString(36).toUpperCase()}`;
    setState((s) => ({
      ...s,
      migrationProgress: {
        ...s.migrationProgress,
        migrationId,
        status: "running",
        totalUsers: s.userMappings.length,
        logs: [
          `[${new Date().toISOString()}] Migration started with mode: ${s.migrationConfig.mode}`,
          `[${new Date().toISOString()}] Migration ID: ${migrationId}`,
        ],
      },
    }));

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 800));
      setState((s) => ({
        ...s,
        migrationProgress: {
          ...s.migrationProgress,
          filesMigrated: s.migrationProgress.filesMigrated + Math.floor(Math.random() * 5 + 1),
          failedFiles: s.migrationProgress.failedFiles + (Math.random() > 0.85 ? 1 : 0),
          logs: [
            ...s.migrationProgress.logs,
            `[${new Date().toISOString()}] Processing batch ${i}/${steps}...`,
          ],
        },
      }));
    }

    setState((s) => ({
      ...s,
      migrationProgress: {
        ...s.migrationProgress,
        status: "completed",
        logs: [
          ...s.migrationProgress.logs,
          `[${new Date().toISOString()}] Migration completed successfully.`,
        ],
      },
    }));
    toast({ title: "Migration Complete", description: "All files have been processed." });
  }, [toast]);

  const handleDownloadReport = () => {
    const report = JSON.stringify(state.migrationProgress, null, 2);
    const blob = new Blob([report], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `migration-report-${state.migrationProgress.migrationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = () => {
    toast({ title: "Retry initiated", description: "Retrying failed files..." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          {/* Left: branding */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">GW</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">GWS Drive Migration Tool</h1>
              <p className="text-xs text-muted-foreground">
                Google Workspace Drive-to-Drive Migration
              </p>
            </div>
          </div>

          {/* Right: user info + sign out */}
          <div className="flex items-center gap-4">
            {user?.picture && (
              <img
                src={user.picture}
                alt={user.name || user.email}
                className="w-7 h-7 rounded-full"
              />
            )}
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <StepIndicator currentStep={state.currentStep} onStepClick={setStep} />

        {state.currentStep === 0 && (
          <DomainConfigStep
            config={state.domainConfig}
            onChange={(c) => setState((s) => ({ ...s, domainConfig: c }))}
            onNext={next}
          />
        )}
        {state.currentStep === 1 && (
          <UserMappingStep
            csvFile={state.csvFile}
            mappings={state.userMappings}
            onFileChange={(f) => setState((s) => ({ ...s, csvFile: f }))}
            onMappingsChange={(m) => setState((s) => ({ ...s, userMappings: m }))}
            onNext={next}
            onBack={back}
          />
        )}
        {state.currentStep === 2 && (
          <ValidationStep
            status={state.connectionStatus}
            onValidate={handleValidate}
            onNext={next}
            onBack={back}
          />
        )}
        {state.currentStep === 3 && (
          <MigrationModeStep
            config={state.migrationConfig}
            onChange={(c) => setState((s) => ({ ...s, migrationConfig: c }))}
            onNext={next}
            onBack={back}
          />
        )}
        {state.currentStep === 4 && (
          <ExecutionStep
            progress={state.migrationProgress}
            migrationConfig={state.migrationConfig}
            onStart={handleStartMigration}
            onNext={next}
            onBack={back}
          />
        )}
        {state.currentStep === 5 && (
          <LogsReportsStep
            progress={state.migrationProgress}
            onDownloadReport={handleDownloadReport}
            onRetry={handleRetry}
            onBack={back}
          />
        )}
      </main>
    </div>
  );
};

export default MigrationWizard;