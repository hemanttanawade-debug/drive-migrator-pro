/**
 * API integration layer for the Python backend.
 * 
 * Configure BASE_URL to point to your Flask/FastAPI backend.
 * Example: http://localhost:8000/api
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export async function saveConfig(formData: FormData): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/config`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Failed to save configuration");
  return res.json();
}

export async function uploadUserMapping(file: File): Promise<{ mappings: { sourceUser: string; destinationUser: string }[] }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/user-mapping`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Failed to upload user mapping");
  return res.json();
}

export async function validateConnection(): Promise<{ source: boolean; destination: boolean; errors?: string[] }> {
  const res = await fetch(`${BASE_URL}/validate`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to validate connection");
  return res.json();
}

export async function startMigration(mode: string, opts?: { migrationId?: string }): Promise<{ migrationId: string }> {
  const res = await fetch(`${BASE_URL}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...opts }),
  });
  if (!res.ok) throw new Error("Failed to start migration");
  return res.json();
}

export async function getMigrationStatus(migrationId: string): Promise<{
  status: string;
  totalUsers: number;
  filesMigrated: number;
  failedFiles: number;
  logs: string[];
}> {
  const res = await fetch(`${BASE_URL}/migration/${migrationId}/status`);
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}

export async function getMigrationLogs(migrationId: string): Promise<{ logs: string[] }> {
  const res = await fetch(`${BASE_URL}/migration/${migrationId}/logs`);
  if (!res.ok) throw new Error("Failed to get logs");
  return res.json();
}

export async function downloadReport(migrationId: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/migration/${migrationId}/report`);
  if (!res.ok) throw new Error("Failed to download report");
  return res.blob();
}

export async function retryFailed(migrationId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/migration/${migrationId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to retry");
  return res.json();
}
