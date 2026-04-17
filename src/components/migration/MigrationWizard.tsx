import { useAuth } from "@/context/AuthContext";
import StepIndicator from "./StepIndicator";
import DomainConfigStep from "./steps/DomainConfigStep";
import UserMappingStep from "./steps/UserMappingStep";
import ValidationStep from "./steps/ValidationStep";
import MigrationModeStep from "./steps/MigrationModeStep";
import ExecutionStep from "./steps/ExecutionStep";
import LogsReportsStep from "./steps/LogsReportsStep";
import { Button } from "@/components/ui/button";
import AppLogo from "./AppLogo";
import { useMigrationWizard } from "./useMigrationWizard";

const MigrationWizard = () => {
  const { user, logout } = useAuth();
  const {
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
  } = useMigrationWizard();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <AppLogo />

          <div className="flex items-center gap-4">
            {user?.picture && (
              <img
                src={user.picture}
                alt={user.name || user.email}
                className="h-8 w-8 rounded-full ring-2 ring-background shadow-soft"
              />
            )}
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <StepIndicator
          currentStep={state.currentStep}
          maxAccessibleStep={maxAccessibleStep}
          completedSteps={state.completedSteps}
          onStepClick={goToStep}
        />

        {state.currentStep === 0 && (
          <DomainConfigStep
            config={state.domainConfig}
            onChange={updateDomainConfig}
            onSubmit={submitDomainConfig}
            isSubmitting={loadingStates.savingConfig}
          />
        )}
        {state.currentStep === 1 && (
          <UserMappingStep
            csvFile={state.csvFile}
            mappings={state.userMappings}
            onFileChange={updateCsvFile}
            onMappingsChange={updateUserMappings}
            onSubmit={submitUserMapping}
            onBack={goBack}
            isSubmitting={loadingStates.uploadingMapping}
          />
        )}
        {state.currentStep === 2 && (
          <ValidationStep
            status={state.connectionStatus}
            onValidate={runValidation}
            onNext={() => goToStep(3)}
            onBack={goBack}
          />
        )}
        {state.currentStep === 3 && (
          <MigrationModeStep
            config={state.migrationConfig}
            onChange={updateMigrationConfig}
            onSubmit={submitMigrationMode}
            onBack={goBack}
            isSubmitting={loadingStates.savingMode}
          />
        )}
        {state.currentStep === 4 && (
          <ExecutionStep
            progress={state.migrationProgress}
            migrationConfig={state.migrationConfig}
            onStart={startMigrationRun}
            onNext={() => goToStep(5)}
            onBack={goBack}
          />
        )}
        {state.currentStep === 5 && (
          <LogsReportsStep
            progress={state.migrationProgress}
            onDownloadReport={downloadMigrationReport}
            onRetry={retryFailedItems}
            onBack={() => goToStep(4)}
          />
        )}
      </main>
    </div>
  );
};

export default MigrationWizard;