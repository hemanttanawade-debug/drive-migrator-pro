export interface DomainConfig {
  sourceDomain: string;
  sourceAdminEmail: string;
  sourceCredentials: File | null;
  destinationDomain: string;
  destinationAdminEmail: string;
  destinationCredentials: File | null;
}

export interface UserMapping {
  sourceUser: string;
  destinationUser: string;
}

export interface ConnectionStatus {
  source: "pending" | "success" | "error";
  destination: "pending" | "success" | "error";
  sourceError?: string;
  destinationError?: string;
}

export type MigrationMode = "custom" | "shared-drives" | "full" | "resume";

export interface MigrationConfig {
  mode: MigrationMode;
  resumeMigrationId?: string;
}

export interface MigrationProgress {
  migrationId: string;
  status: "pending" | "running" | "completed" | "failed";
  totalUsers: number;
  filesMigrated: number;
  failedFiles: number;
  logs: string[];
}

export interface WizardState {
  currentStep: number;
  sessionId: string;
  completedSteps: number[];
  domainConfig: DomainConfig;
  userMappings: UserMapping[];
  csvFile: File | null;
  connectionStatus: ConnectionStatus;
  migrationConfig: MigrationConfig;
  migrationProgress: MigrationProgress;
}
