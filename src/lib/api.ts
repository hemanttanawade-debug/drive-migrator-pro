/**
 * Authenticated API integration layer.
 *
 * Reads the Google ID token from sessionStorage and attaches it as a
 * Bearer token on every request. On expiry or 401, forces re-login.
 *
 * BASE_URL points at the Flask backend root (no trailing /api suffix needed
 * here — each function path already includes /api/...).
 */

import { buildApiUrl } from "@/lib/backend";

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
  // reload() is synchronous in the browser but TS doesn't know that,
  // so we throw to satisfy the `never` return type and stop execution.
  throw new Error("Session expired — reloading");
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getStoredToken();
  if (!token) forceRelogin();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // Let the browser set Content-Type for FormData (needs the boundary param).
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

// ─── Typed response helper ────────────────────────────────────────────────────

async function parseJSON<T>(res: Response, errorMsg: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || errorMsg);
  }
  return res.json() as Promise<T>;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function createMigrationSession(): Promise<{
  sessionId: string;
  message: string;
}> {
  const res = await apiFetch("/api/config/new", { method: "POST" });
  return parseJSON(res, "Failed to start a new migration session");
}

export async function saveConfig(
  formData: FormData
): Promise<{ success: boolean; message: string; sessionId: string }> {
  const res = await apiFetch("/api/config", { method: "POST", body: formData });
  return parseJSON(res, "Failed to save configuration");
}

export async function uploadUserMapping(
  file: File,
  sessionId?: string
): Promise<{ mappings: { sourceUser: string; destinationUser: string }[] }> {
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("sessionId", sessionId);
  const res = await apiFetch("/api/user-mapping", { method: "POST", body: formData });
  return parseJSON(res, "Failed to upload user mapping");
}

export async function validateConnection(sessionId?: string): Promise<{
  source: boolean;
  destination: boolean;
  errors?: string[];
}> {
  const res = await apiFetch("/api/validate", {
    method: "POST",
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
  return parseJSON(res, "Failed to validate connection");
}

export async function saveMigrationMode(
  mode: string,
  sessionId?: string
): Promise<{ success: boolean; mode: string; message: string }> {
  const res = await apiFetch("/api/migration-mode", {
    method: "POST",
    body: JSON.stringify({ mode, ...(sessionId ? { sessionId } : {}) }),
  });
  return parseJSON(res, "Failed to save migration mode");
}

export async function startMigration(
  mode: string,
  opts?: { migrationId?: string; sessionId?: string }
): Promise<{ migrationId: string }> {
  const res = await apiFetch("/api/migrate", {
    method: "POST",
    body: JSON.stringify({ mode, ...opts }),
  });
  return parseJSON(res, "Failed to start migration");
}

export async function getMigrationStatus(migrationId: string): Promise<{
  migrationId?: string;
  status: string;
  totalUsers: number;
  filesMigrated: number;
  failedFiles: number;
  logs: string[];
}> {
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

export async function getMigrationLogs(
  migrationId: string
): Promise<{ logs: string[] }> {
  const res = await apiFetch(`/api/migration/${migrationId}/logs`);
  return parseJSON(res, "Failed to get migration logs");
}

export async function downloadReport(migrationId: string): Promise<Blob> {
  const res = await apiFetch(`/api/migration/${migrationId}/report`);
  if (!res.ok) throw new Error("Failed to download report");
  return res.blob();
}

export async function retryFailed(
  migrationId: string
): Promise<{ success: boolean }> {
  const res = await apiFetch(`/api/migration/${migrationId}/retry`, {
    method: "POST",
  });
  return parseJSON(res, "Failed to retry failed files");
}