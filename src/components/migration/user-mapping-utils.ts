import type { UserMapping } from "@/types/migration";

const SOURCE_HEADERS = new Set(["source", "source_user"]);
const DESTINATION_HEADERS = new Set(["destination", "destination_user"]);

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");

export const parseUserMappingCsv = (content: string): {
  mappings: UserMapping[];
  normalizedCsv: string;
} => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one user mapping.");
  }

  const headers = lines[0].split(",").map(normalizeHeader);
  const sourceIndex = headers.findIndex((header) => SOURCE_HEADERS.has(header));
  const destinationIndex = headers.findIndex((header) => DESTINATION_HEADERS.has(header));

  if (sourceIndex === -1 || destinationIndex === -1) {
    throw new Error(
      "CSV must include source,destination or source_user,destination_user columns."
    );
  }

  const mappings = lines
    .slice(1)
    .map((line) => line.split(",").map((value) => value.trim()))
    .map((columns) => ({
      sourceUser: columns[sourceIndex] || "",
      destinationUser: columns[destinationIndex] || "",
    }))
    .filter((mapping) => mapping.sourceUser && mapping.destinationUser);

  if (mappings.length === 0) {
    throw new Error("No valid source and destination user pairs were found in the CSV.");
  }

  const normalizedCsv = [
    "source,destination",
    ...mappings.map(({ sourceUser, destinationUser }) => `${sourceUser},${destinationUser}`),
  ].join("\n");

  return { mappings, normalizedCsv };
};

export const normalizeUserMappingFile = async (file: File) => {
  const { normalizedCsv } = parseUserMappingCsv(await file.text());
  return new File([normalizedCsv], "users.csv", { type: "text/csv" });
};