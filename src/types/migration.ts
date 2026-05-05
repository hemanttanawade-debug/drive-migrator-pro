export interface DomainConfig {
  sourceDomain: string;
  sourceAdminEmail: string;
  sourceCredentials: File | null;
  destinationDomain: string;
  destinationAdminEmail: string;
  destinationCredentials: File | null;
}

export interface UserMappingRow {
  sourceUser: string;
  destinationUser: string;
  sourceSizeGb?: number | null;
  destinationSizeGb?: number | null;
}

export interface SharedDriveMappingRow {
  sourceDriveId: string;
  destinationDriveId: string;
  sourceSizeGb?: number | null;
  destinationSizeGb?: number | null;
}

// kept for backwards-compat with existing imports
export type UserMapping = UserMappingRow;

export type ValidationCheckKey =
  | "serviceAccount"
  | "domainDelegation"
  | "cloudSql"
  | "gcsBucket";

export type CheckStatus = "pending" | "loading" | "success" | "error";

export interface ValidationCheck {
  key: ValidationCheckKey;
  label: string;
  description: string;
  status: CheckStatus;
  error?: string;
}

export interface ConnectionStatus {
  source: "pending" | "success" | "error";
  destination: "pending" | "success" | "error";
  sourceError?: string;
  destinationError?: string;
  checks: ValidationCheck[];
}

export type MigrationScope = "my-drive" | "shared-drives" | "both";
export type MigrationMode = "custom" | "shared-drives" | "full" | "resume";

export interface MigrationConfig {
  scope: MigrationScope;
  mode: MigrationMode;
  resumeMigrationId?: string;
}

export interface ScanSummary {
  totalFiles: number;
  totalFolders: number;
  totalSizeGb: number;
  estimateDays: number;
  estimateHours: number;
  scanned: boolean;
}

export interface MigrationProgress {
  migrationId: string;
  status: "pending" | "running" | "completed" | "failed";
  totalUsers: number;
  filesMigrated: number;
  failedFiles: number;
  filesTotal?: number;
  filesDone?: number;
  dataTransferredGb?: number;
  dataTotalGb?: number;
  logs: string[];
}

export interface WizardState {
  currentStep: number;
  sessionId: string;
  completedSteps: number[];
  domainConfig: DomainConfig;
  userMappings: UserMappingRow[];
  sharedDriveMappings: SharedDriveMappingRow[];
  csvFile: File | null;
  sharedDriveCsvFile: File | null;
  connectionStatus: ConnectionStatus;
  migrationConfig: MigrationConfig;
  scan: ScanSummary;
  migrationProgress: MigrationProgress;
}

// ─── Dashboard types ──────────────────────────────────────────────────────────

export interface DashboardUserRow {
  sourceUser: string;
  destinationUser: string;
  status: "completed" | "running" | "failed" | "pending";
  progressPct: number;
  filesDone: number;
  filesTotal: number;
  filesFailed: number;
  sizeDoneGb: number;
  sizeTotalGb: number;
}

export interface DashboardSummary {
  totalUsers: number;
  completed: number;
  inProgress: number;
  failed: number;
  filesMigrated: number;
  filesTotal: number;
  dataTransferredGb: number;
  dataTotalGb: number;
  rows: DashboardUserRow[];
}
