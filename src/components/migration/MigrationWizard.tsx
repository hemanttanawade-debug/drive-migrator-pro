import StepIndicator from "./StepIndicator";
import DomainConfigStep from "./steps/DomainConfigStep";
import UserMappingStep from "./steps/UserMappingStep";
import ValidationStep from "./steps/ValidationStep";
import MigrationModeStep from "./steps/MigrationModeStep";
import ExecutionStep from "./steps/ExecutionStep";
import { useMigrationContext } from "./MigrationContext";

const MigrationWizard = () => {
  const w = useMigrationContext();

  return (
    <div className="space-y-6">
      <StepIndicator
        currentStep={w.state.currentStep}
        maxAccessibleStep={w.maxAccessibleStep}
        completedSteps={w.state.completedSteps}
        onStepClick={w.goToStep}
      />

      {w.state.currentStep === 0 && (
        <DomainConfigStep
          config={w.state.domainConfig}
          onChange={w.updateDomainConfig}
          onSubmit={w.submitDomainConfig}
          isSubmitting={w.loadingStates.savingConfig}
          locked={w.isMigrationRunning}
        />
      )}
      {w.state.currentStep === 1 && (
        <ValidationStep
          status={w.state.connectionStatus}
          onValidate={w.runValidation}
          onNext={() => w.goToStep(2)}
          onBack={w.goBack}
          isValidating={w.loadingStates.validating}
        />
      )}
      {w.state.currentStep === 2 && (
        <UserMappingStep
          config={w.state.migrationConfig}
          onConfigChange={w.updateMigrationConfig}
          csvFile={w.state.csvFile}
          userMappings={w.state.userMappings}
          sharedDriveCsvFile={w.state.sharedDriveCsvFile}
          sharedDriveMappings={w.state.sharedDriveMappings}
          onUserCsvChange={w.updateCsvFile}
          onUserMappingsChange={w.updateUserMappings}
          onSharedDriveCsvChange={w.updateSharedDriveCsvFile}
          onSharedDriveMappingsChange={w.updateSharedDriveMappings}
          onUploadUserCsv={w.submitUserMapping}
          onUploadSharedDriveCsv={w.submitSharedDriveMapping}
          onContinue={w.completeMappingStep}
          onBack={w.goBack}
          loading={{
            uploadingMapping: w.loadingStates.uploadingMapping,
            uploadingSharedDrive: w.loadingStates.uploadingSharedDrive,
            fetchingSizes: w.loadingStates.fetchingSizes,
          }}
          locked={w.isMigrationRunning}
        />
      )}
      {w.state.currentStep === 3 && (
        <MigrationModeStep
          config={w.state.migrationConfig}
          onChange={w.updateMigrationConfig}
          onSubmit={w.submitMigrationMode}
          onBack={w.goBack}
          isSubmitting={w.loadingStates.savingMode}
          locked={w.isMigrationRunning}
        />
      )}
      {w.state.currentStep === 4 && (
        <ExecutionStep
          progress={w.state.migrationProgress}
          scan={w.state.scan}
          onScan={w.runPreScan}
          onStart={w.startMigrationRun}
          onResume={w.resumeRun}
          onSync={w.syncStatus}
          onBack={w.goBack}
          onDownloadReport={w.downloadMigrationReport}
          onRetry={w.retryFailedItems}
          loading={{
            scanning: w.loadingStates.scanning,
            startingMigration: w.loadingStates.startingMigration,
            syncing: w.loadingStates.syncing,
            resuming: w.loadingStates.resuming,
          }}
        />
      )}
    </div>
  );
};

export default MigrationWizard;
