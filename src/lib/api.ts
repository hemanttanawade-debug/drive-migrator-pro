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

// ─── Storage sizes ────────────────────────────────────────────────────────────

/**
 * Shape returned by the backend for each user.
 * drive_gb is null when the Reports API has no data yet (24–48 hr lag)
 * or when the user was not found / permissions are missing.
 */
export interface UserStorageInfo {
  drive_gb: number | null;
  date: string | null;
  error: string | null;
}

/**
 * POST /api/storage-sizes — returns Drive storage usage per user
 * via the Admin Reports API on the backend.
 *
 * Body: { sessionId, users: ["a@x.com", ...], side: "source" | "destination" }
 * Resp: { sizes: { "a@x.com": { drive_gb: 1.23, date: "2025-04-19", error: null } } }
 */
export async function fetchStorageSizes(
  side: "source" | "destination",
  users: string[],
  sessionId?: string
): Promise<Record<string, UserStorageInfo>> {
  const res = await apiFetch("/api/storage-sizes", {
    method: "POST",
    body: JSON.stringify({ side, users, ...(sessionId ? { sessionId } : {}) }),
  });
  const data = await parseJSON<{ sizes?: Record<string, UserStorageInfo> }>(
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

// ─── Step 5: Discovery (pre-migration scan) ───────────────────────────────────

const BYTES_PER_GB = 1024 ** 3;
// Conservative throughput assumption for time estimates (≈ Drive API average)
const GB_PER_HOUR = 4;

export interface DiscoveryTotals {
  total_users: number;
  completed_users: number;
  failed_users: number;
  total_files: number;
  total_folders: number;
  total_size_bytes: number;
}

/**
 * POST /api/discovery/start
 *
 * Runs the full Drive scan synchronously on the backend and returns totals
 * once complete. No streaming or polling required.
 *
 * Returns:
 *   { run_id, totals: DiscoveryTotals, results: [...per-user dicts] }
 */
export async function startDiscovery(params: {
  runId: string;
  userMapping: Record<string, string>;
  workers?: number;
  sessionId?: string;
}): Promise<{ run_id: string; totals: DiscoveryTotals; results: unknown[] }> {
  const res = await apiFetch("/api/discovery/start", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      userMapping: params.userMapping,
      workers: params.workers ?? 4,
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    }),
  });
  return parseJSON(res, "Failed to run discovery scan");
}

export function totalsToScanSummary(totals: DiscoveryTotals): ScanSummary {
  const sizeGb = totals.total_size_bytes / BYTES_PER_GB;
  const totalHours = sizeGb / GB_PER_HOUR;
  const estimateDays = Math.floor(totalHours / 24);
  const estimateHours = Math.round(totalHours - estimateDays * 24);
  return {
    totalFiles: totals.total_files,
    totalFolders: totals.total_folders,
    totalSizeGb: Number(sizeGb.toFixed(2)),
    estimateDays,
    estimateHours,
    scanned: true,
  };
}

// ─── Migration stream token (still needed for migration SSE) ──────────────────

/**
 * POST /api/migration/stream-token
 * EventSource cannot send Authorization headers, so the backend issues a
 * short-lived single-use token (?stream_token=…) for the migration SSE URL.
 */
export async function getStreamToken(): Promise<string> {
  const res = await apiFetch("/api/migration/stream-token", { method: "POST" });
  const data = await parseJSON<{ stream_token: string }>(res, "Failed to get stream token");
  return data.stream_token;
}

// ─── Migration execution ──────────────────────────────────────────────────────

export async function startMigrationFresh(params: {
  runId: string;
  userMapping: Record<string, string>;
  folderWorkers?: number;
  globalWorkers?: number;
}): Promise<{ run_id: string; total_users: number }> {
  const res = await apiFetch("/api/migration/start", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      userMapping: params.userMapping,
      folderWorkers: params.folderWorkers ?? 4,
      globalWorkers: params.globalWorkers ?? 14,
    }),
  });
  return parseJSON(res, "Failed to start migration");
}

export async function resumeMigration(params: {
  runId: string;
  folderWorkers?: number;
  globalWorkers?: number;
}): Promise<{ run_id: string; total_users: number; pending_files: number; done_files: number }> {
  const res = await apiFetch("/api/migration/resume", {
    method: "POST",
    body: JSON.stringify({
      runId: params.runId,
      folderWorkers: params.folderWorkers ?? 4,
      globalWorkers: params.globalWorkers ?? 14,
    }),
  });
  return parseJSON(res, "Failed to resume migration");
}

export interface MigrationRunRow {
  run_id: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  total_items: number;
  completed: number;
  failed: number;
  pending: number;
  done: number;
  source_domain: string;
  dest_domain: string;
  resumable: boolean;
}

export async function listMigrationRuns(): Promise<MigrationRunRow[]> {
  const res = await apiFetch("/api/migration/runs");
  const data = await parseJSON<{ runs: MigrationRunRow[] }>(res, "Failed to list runs");
  return data.runs ?? [];
}

export async function getMigrationStatus(migrationId: string) {
  const res = await apiFetch(`/api/migration/status?run_id=${encodeURIComponent(migrationId)}`);
  const data = await parseJSON<{
    run_id?: string;
    status: string;
    totals?: {
      total_users?: number;
      files_migrated?: number;
      files_failed?: number;
      files_done?: number;
      files_total?: number;
    };
    summary?: any;
  }>(res, "Failed to get migration status");

  const totals = data.totals ?? {};
  const raw = (data.status || "").toLowerCase();
  let status: "pending" | "running" | "completed" | "failed";
  if (raw === "running" || raw === "in_progress") status = "running";
  else if (raw === "done" || raw === "completed") status = "completed";
  else if (raw === "error" || raw === "failed") status = "failed";
  else status = "pending";

  return {
    migrationId: data.run_id ?? migrationId,
    status,
    totalUsers: totals.total_users ?? 0,
    filesMigrated: totals.files_migrated ?? 0,
    failedFiles: totals.files_failed ?? 0,
    logs: [] as string[],
  };
}

export async function downloadReport(migrationId: string): Promise<Blob> {
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
  return resumeMigration({ runId: migrationId });
}

// ─── Dashboard (assumed) ──────────────────────────────────────────────────────

/** GET /api/dashboard?migrationId=<id?> — current migration aggregates + per-user rows */
export async function getDashboard(migrationId?: string): Promise<DashboardSummary> {
  const path = migrationId
    ? `/api/dashboard?migrationId=${encodeURIComponent(migrationId)}`
    : "/api/dashboard";
  const res = await apiFetch(path);
  if (!res.ok) {
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
    sourceUser:      r.sourceUser      ?? r.source_user      ?? "",
    destinationUser: r.destinationUser ?? r.destination_user ?? "",
    status:          (r.status ?? "pending") as DashboardSummary["rows"][number]["status"],
    progressPct:     r.progressPct     ?? r.progress_pct     ?? 0,
    filesDone:       r.filesDone       ?? r.files_done       ?? 0,
    filesTotal:      r.filesTotal      ?? r.files_total      ?? 0,
    filesFailed:     r.filesFailed     ?? r.files_failed     ?? 0,
    sizeDoneGb:      r.sizeDoneGb      ?? r.size_done_gb     ?? 0,
    sizeTotalGb:     r.sizeTotalGb     ?? r.size_total_gb    ?? 0,
  }));

  return {
    totalUsers:        data.totalUsers        ?? data.total_users        ?? rows.length,
    completed:         data.completed         ?? 0,
    inProgress:        data.inProgress        ?? data.in_progress        ?? 0,
    failed:            data.failed            ?? 0,
    filesMigrated:     data.filesMigrated     ?? data.files_migrated     ?? 0,
    filesTotal:        data.filesTotal        ?? data.files_total        ?? 0,
    dataTransferredGb: data.dataTransferredGb ?? data.data_transferred_gb ?? 0,
    dataTotalGb:       data.dataTotalGb       ?? data.data_total_gb      ?? 0,
    rows,
  };
}

// ─── Settings: reset everything ───────────────────────────────────────────────

/**
 * DELETE /api/reset — wipes filesystem (credentials, CSVs, session.json) and
 * optionally deletes SQL rows for one/many run IDs or every migration row.
 */
export async function resetAll(opts?: {
  runId?: string;
  runIds?: string[];
  deleteAll?: boolean;
}) {
  const res = await apiFetch("/api/reset", {
    method: "DELETE",
    body: JSON.stringify(opts ?? { deleteAll: true }),
  });
  return parseJSON<{
    success: boolean;
    new_session_id: string;
    files_deleted: string[];
    sql: {
      runs_deleted: number;
      items_deleted: number;
      folders_deleted: number;
      permissions_deleted: number;
      users_deleted: number;
      error: string | null;
    };
  }>(res, "Failed to reset migration data");
}
