import type { SharedDriveMappingRow } from "@/types/migration";

const SOURCE_HEADERS = new Set(["source", "source_id", "source_drive_id"]);
const DEST_HEADERS = new Set(["destination", "destination_id", "destination_drive_id"]);

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "_");

export const parseSharedDriveCsv = (
  content: string
): { mappings: SharedDriveMappingRow[]; normalizedCsv: string } => {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one drive mapping.");
  }

  const headers = lines[0].split(",").map(norm);
  const sIdx = headers.findIndex((h) => SOURCE_HEADERS.has(h));
  const dIdx = headers.findIndex((h) => DEST_HEADERS.has(h));

  if (sIdx === -1 || dIdx === -1) {
    throw new Error(
      "CSV must include source,destination columns (Shared Drive IDs)."
    );
  }

  const mappings = lines
    .slice(1)
    .map((l) => l.split(",").map((v) => v.trim()))
    .map((cols) => ({
      sourceDriveId: cols[sIdx] || "",
      destinationDriveId: cols[dIdx] || "",
    }))
    .filter((m) => m.sourceDriveId && m.destinationDriveId);

  if (mappings.length === 0) {
    throw new Error("No valid source/destination drive ID pairs were found.");
  }

  const normalizedCsv = [
    "source,destination",
    ...mappings.map((m) => `${m.sourceDriveId},${m.destinationDriveId}`),
  ].join("\n");

  return { mappings, normalizedCsv };
};

export const normalizeSharedDriveFile = async (file: File) => {
  const { normalizedCsv } = parseSharedDriveCsv(await file.text());
  return new File([normalizedCsv], "shared_drives.csv", { type: "text/csv" });
};
