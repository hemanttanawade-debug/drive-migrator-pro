/**
 * Authenticated API integration layer.
 *
 * Every helper attaches the Google ID token from sessionStorage as a Bearer
 * token. On expiry or 401, the user is forced to re-authenticate.
 *
 * NOTE: Endpoints marked "(assumed)" do not yet exist in the Flask backend.
 * They follow the conventions of the existing routes and are documented in
 * docs/flask-endpoints.md so the backend team can implement them.
 */

import { buildApiUrl } from "@/lib/backend";
import type {
  DashboardSummary,
  ScanSummary,
  SharedDriveMappingRow,
  UserMappingRow,
} from "@/types/migration";

// ─── Auth token helper ────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  try {
    const stored = sessionStorage.getItem("gws_user");
    if (!stored) return null;
    const user = JSON.parse(stored);
    if (user.expiresAt <= Date.now()) return null;
    return user.idToken;
  } catch {
    return null;
  }
}

function forceRelogin(): never {
  sessionStorage.removeItem("gws_user");
  window.location.reload();
  throw new Error("Session expired — reloading");
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  if (!token) forceRelogin();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), { ...options, headers });
  } catch {
    throw new Error(
      "Cannot reach the Flask API. Check VITE_API_URL and allow this frontend origin in Flask CORS."
    );
  }

  if (res.status === 401) forceRelogin();

  return res;
}

async function parseJSON<T>(res: Response, errorMsg: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || (body as any).message || errorMsg);
  }
  return res.json() as Promise<T>;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function createMigrationSession() {
  const res = await apiFetch("/api/config/new", { method: "POST" });
  return parseJSON<{ sessionId: string; message: string }>(res, "Failed to start a new session");
}

// ─── Step 1: domain config ────────────────────────────────────────────────────

export async function saveConfig(formData: FormData, method: "POST" | "PUT" = "POST") {
  const res = await apiFetch("/api/config", { method, body: formData });
  return parseJSON<{ success: boolean; message: string; sessionId: string }>(
    res,
    "Failed to save configuration"
  );
}

// ─── Step 2: validation ───────────────────────────────────────────────────────

export async function validateConnection(sessionId?: string) {
  const res = await apiFetch("/api/validate", {
    method: "POST",
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
  const data = await parseJSON<{
    source: boolean;
    destination: boolean;
    errors?: string[];
    checks?: Partial<Record<
      "service_account" | "domain_delegation" | "cloud_sql" | "gcs_bucket",
      { ok: boolean; error?: string }
    >>;
  }>(res, "Failed to validate connection");

  return data;
}

// ─── Pre-flight readiness checks ──────────────────────────────────────────────

export type PreflightCheckKey =
  | "service_account"
  | "domain_delegation"
  | "cloud_sql"
  | "gcs_bucket";

export interface PreflightCheckResult {
  ok: boolean;
  message: string;
  detail: string;
}

export interface PreflightResult {
  overall: boolean;
  checks: Record<PreflightCheckKey, PreflightCheckResult>;
}

/**
 * POST /api/preflight — runs all 4 enterprise readiness checks:
 *   1. service_account   — both credential JSONs load and are valid service accounts
 *   2. domain_delegation — admin email can impersonate users on both domains
 *   3. cloud_sql         — backend can read/write checkpoint state to Cloud SQL
 *   4. gcs_bucket        — backend can read/write files to the staging GCS bucket
 *
 * All 4 checks run independently — one failure never skips the others.
 */
export async function runPreflight(sessionId?: string): Promise<PreflightResult> {
  const res = await apiFetch("/api/preflight", {
    method: "POST",
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
  return parseJSON<PreflightResult>(res, "Pre-flight checks failed");
}

// ─── Step 3: user mapping (My Drive) ──────────────────────────────────────────

export async function uploadUserMapping(file: File, sessionId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (sessionId) fd.append("sessionId", sessionId);
  const res = await apiFetch("/api/user-mapping", { method: "POST", body: fd });
  return parseJSON<{ mappings: { sourceUser: string; destinationUser: string }[] }>(
    res,
    "Failed to upload user mapping"
  );
}

/** (assumed) POST /api/shared-drive-mapping — uploads shared_drives.csv */
export async function uploadSharedDriveMapping(file: File, sessionId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (sessionId) fd.append("sessionId", sessionId);
  const res = await apiFetch("/api/shared-drive-mapping", { method: "POST", body: fd });
  return parseJSON<{
    mappings: { sourceDriveId: string; destinationDriveId: string }[];
  }>(res, "Failed to upload shared drive mapping");
}

/**
 * (assumed) POST /api/storage-sizes — returns Drive storage usage per user
 * via the Admin SDK on the backend.
 *
 * Body: { sessionId, users: ["a@x.com", ...], side: "source" | "destination" }
 * Resp: { sizes: { "a@x.com": 12.4, ... } }
 */
export async function fetchStorageSizes(
  side: "source" | "destination",
  users: string[],
  sessionId?: string
): Promise<Record<string, number>> {
  const res = await apiFetch("/api/storage-sizes", {
    method: "POST",
    body: JSON.stringify({ side, users, ...(sessionId ? { sessionId } : {}) }),
  });
  const data = await parseJSON<{ sizes?: Record<string, number> }>(
    res,
    "Failed to fetch storage sizes"
  );
  return data.sizes ?? {};
}

// ─── Step 4: migration mode ───────────────────────────────────────────────────

export async function saveMigrationMode(mode: string, sessionId?: string) {
  const res = await apiFetch("/api/migration-mode", {
    method: "POST",
    body: JSON.stringify({ mode, ...(sessionId ? { sessionId } : {}) }),
  });
  return parseJSON<{ success: boolean; mode: string; message: string }>(
    res,
    "Failed to save migration mode"
  );
}

// ─── Step 5: scan ─────────────────────────────────────────────────────────────

/**
 * (assumed) POST /api/scan — walks all mapped users/drives and returns
 * pre-migration totals. Persists to SQL on the backend.
 */
export async function runScan(sessionId?: string): Promise<ScanSummary> {
  const res = await apiFetch("/api/scan", {
    method: "POST",
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
  const data = await parseJSON<{
    totalFiles?: number;
    totalFolders?: number;
    totalSizeGb?: number;
    estimateDays?: number;
    estimateHours?: number;
    total_files?: number;
    total_folders?: number;
    total_size_gb?: number;
    estimate_days?: number;
    estimate_hours?: number;
  }>(res, "Failed to scan source drives");

  return {
    totalFiles: data.totalFiles ?? data.total_files ?? 0,
    totalFolders: data.totalFolders ?? data.total_folders ?? 0,
    totalSizeGb: data.totalSizeGb ?? data.total_size_gb ?? 0,
    estimateDays: data.estimateDays ?? data.estimate_days ?? 0,
    estimateHours: data.estimateHours ?? data.estimate_hours ?? 0,
    scanned: true,
  };
}

// ─── Migration execution ──────────────────────────────────────────────────────

export async function startMigration(
  mode: string,
  opts?: { migrationId?: string; sessionId?: string }
) {
  const res = await apiFetch("/api/migrate", {
    method: "POST",
    body: JSON.stringify({ mode, ...opts }),
  });
  return parseJSON<{ migrationId: string }>(res, "Failed to start migration");
}

export async function getMigrationStatus(migrationId: string) {
  const res = await apiFetch(`/api/migration/${migrationId}/status`);
  const data = await parseJSON<{
    migrationId?: string;
    migration_id?: string;
    status: string;
    totalUsers?: number;
    total_users?: number;
    filesMigrated?: number;
    files_migrated?: number;
    failedFiles?: number;
    failed_files?: number;
    logs?: string[];
  }>(res, "Failed to get migration status");

  return {
    migrationId: data.migrationId ?? data.migration_id,
    status: data.status,
    totalUsers: data.totalUsers ?? data.total_users ?? 0,
    filesMigrated: data.filesMigrated ?? data.files_migrated ?? 0,
    failedFiles: data.failedFiles ?? data.failed_files ?? 0,
    logs: data.logs ?? [],
  };
}

export async function getMigrationLogs(migrationId: string) {
  const res = await apiFetch(`/api/migration/${migrationId}/logs`);
  return parseJSON<{ logs: string[] }>(res, "Failed to get migration logs");
}

export async function downloadReport(migrationId: string): Promise<Blob> {
  // (assumed) supports ?format=csv via Accept negotiation
  const res = await apiFetch(`/api/migration/${migrationId}/report?format=csv`);
  if (!res.ok) throw new Error("Failed to download report");
  return res.blob();
}

export async function downloadLogs(migrationId: string): Promise<Blob> {
  const res = await apiFetch(`/api/migration/${migrationId}/logs/download`);
  if (!res.ok) throw new Error("Failed to download logs");
  return res.blob();
}

export async function retryFailed(migrationId: string) {
  const res = await apiFetch(`/api/migration/${migrationId}/retry`, { method: "POST" });
  return parseJSON<{ success: boolean }>(res, "Failed to retry failed files");
}

// ─── Dashboard (assumed) ──────────────────────────────────────────────────────

/** GET /api/dashboard?migrationId=<id?> — current migration aggregates + per-user rows */
export async function getDashboard(migrationId?: string): Promise<DashboardSummary> {
  const path = migrationId
    ? `/api/dashboard?migrationId=${encodeURIComponent(migrationId)}`
    : "/api/dashboard";
  const res = await apiFetch(path);
  if (!res.ok) {
    // Empty fallback so the dashboard renders before backend is wired.
    return {
      totalUsers: 0,
      completed: 0,
      inProgress: 0,
      failed: 0,
      filesMigrated: 0,
      filesTotal: 0,
      dataTransferredGb: 0,
      dataTotalGb: 0,
      rows: [],
    };
  }
  const data: any = await res.json();

  const rows = (data.rows ?? []).map((r: any) => ({
    sourceUser: r.sourceUser ?? r.source_user ?? "",
    destinationUser: r.destinationUser ?? r.destination_user ?? "",
    status: (r.status ?? "pending") as DashboardSummary["rows"][number]["status"],
    progressPct: r.progressPct ?? r.progress_pct ?? 0,
    filesDone: r.filesDone ?? r.files_done ?? 0,
    filesTotal: r.filesTotal ?? r.files_total ?? 0,
    filesFailed: r.filesFailed ?? r.files_failed ?? 0,
    sizeDoneGb: r.sizeDoneGb ?? r.size_done_gb ?? 0,
    sizeTotalGb: r.sizeTotalGb ?? r.size_total_gb ?? 0,
  }));

  return {
    totalUsers: data.totalUsers ?? data.total_users ?? rows.length,
    completed: data.completed ?? 0,
    inProgress: data.inProgress ?? data.in_progress ?? 0,
    failed: data.failed ?? 0,
    filesMigrated: data.filesMigrated ?? data.files_migrated ?? 0,
    filesTotal: data.filesTotal ?? data.files_total ?? 0,
    dataTransferredGb: data.dataTransferredGb ?? data.data_transferred_gb ?? 0,
    dataTotalGb: data.dataTotalGb ?? data.data_total_gb ?? 0,
    rows,
  };
}

// ─── Settings: purge a completed migration ────────────────────────────────────

/**
 * DELETE /api/migration/<id>/purge — (assumed) deletes EVERYTHING for the
 * migration: uploaded files, SQL state, GCS objects, logs, reports.
 * Falls back to existing /cleanup if /purge is not yet implemented.
 */
export async function purgeMigration(migrationId: string) {
  let res = await apiFetch(`/api/migration/${migrationId}/purge`, { method: "DELETE" });
  if (res.status === 404) {
    res = await apiFetch(`/api/migration/${migrationId}/cleanup`, { method: "DELETE" });
  }
  return parseJSON<{ success: boolean; deleted?: string[]; message?: string }>(
    res,
    "Failed to delete migration data"
  );
}
