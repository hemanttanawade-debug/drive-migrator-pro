/**
 * Authenticated API integration layer.
 *
 * Reads the Google ID token from sessionStorage and attaches it as a
 * Bearer token on every request. On expiry or 401, forces re-login.
 *
 * BASE_URL points at the Flask backend root (no trailing /api suffix needed
 * here — each function path already includes /api/...).
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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

export async function saveConfig(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch("/api/config", { method: "POST", body: formData });
  return parseJSON(res, "Failed to save configuration");
}

export async function uploadUserMapping(
  file: File
): Promise<{ mappings: { sourceUser: string; destinationUser: string }[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch("/api/user-mapping", { method: "POST", body: formData });
  return parseJSON(res, "Failed to upload user mapping");
}

export async function validateConnection(): Promise<{
  source: boolean;
  destination: boolean;
  errors?: string[];
}> {
  const res = await apiFetch("/api/validate", { method: "POST" });
  return parseJSON(res, "Failed to validate connection");
}

export async function startMigration(
  mode: string,
  opts?: { migrationId?: string }
): Promise<{ migrationId: string }> {
  const res = await apiFetch("/api/migrate", {
    method: "POST",
    body: JSON.stringify({ mode, ...opts }),
  });
  return parseJSON(res, "Failed to start migration");
}

export async function getMigrationStatus(migrationId: string): Promise<{
  status: string;
  totalUsers: number;
  filesMigrated: number;
  failedFiles: number;
  logs: string[];
}> {
  const res = await apiFetch(`/api/migration/${migrationId}/status`);
  return parseJSON(res, "Failed to get migration status");
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