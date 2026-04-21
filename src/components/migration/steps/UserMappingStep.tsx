import { useCallback, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FileUpload from "../FileUpload";
import type {
  MigrationConfig,
  SharedDriveMappingRow,
  UserMappingRow,
} from "@/types/migration";
import { AlertCircle, ArrowRight, Loader2, Share2, Users } from "lucide-react";
import { parseUserMappingCsv } from "../user-mapping-utils";
import { parseSharedDriveCsv } from "../shared-drive-mapping-utils";

interface Props {
  config: MigrationConfig;
  onConfigChange: (config: MigrationConfig) => void;
  csvFile: File | null;
  userMappings: UserMappingRow[];
  sharedDriveCsvFile: File | null;
  sharedDriveMappings: SharedDriveMappingRow[];
  onUserCsvChange: (f: File | null) => void;
  onUserMappingsChange: (m: UserMappingRow[]) => void;
  onSharedDriveCsvChange: (f: File | null) => void;
  onSharedDriveMappingsChange: (m: SharedDriveMappingRow[]) => void;
  onUploadUserCsv: () => void;
  onUploadSharedDriveCsv: () => void;
  onContinue: () => void;
  onBack: () => void;
  loading: { uploadingMapping: boolean; uploadingSharedDrive: boolean; fetchingSizes: boolean };
  locked?: boolean;
}

const fmtSize = (gb?: number | null) =>
  gb == null ? "—" : `${gb.toFixed(2)} GB`;

const UserMappingStep = ({
  csvFile,
  userMappings,
  sharedDriveCsvFile,
  sharedDriveMappings,
  onUserCsvChange,
  onUserMappingsChange,
  onSharedDriveCsvChange,
  onSharedDriveMappingsChange,
  onUploadUserCsv,
  onUploadSharedDriveCsv,
  onContinue,
  onBack,
  loading,
  locked,
}: Props) => {
  const [userError, setUserError] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  const handleUserFile = useCallback(
    async (file: File | null) => {
      setUserError(null);
      onUserCsvChange(file);
      if (!file) {
        onUserMappingsChange([]);
        return;
      }
      try {
        const parsed = parseUserMappingCsv(await file.text());
        onUserMappingsChange(parsed.mappings);
      } catch (e) {
        setUserError(e instanceof Error ? e.message : "Invalid CSV format.");
        onUserMappingsChange([]);
      }
    },
    [onUserCsvChange, onUserMappingsChange]
  );

  const handleSharedFile = useCallback(
    async (file: File | null) => {
      setDriveError(null);
      onSharedDriveCsvChange(file);
      if (!file) {
        onSharedDriveMappingsChange([]);
        return;
      }
      try {
        const parsed = parseSharedDriveCsv(await file.text());
        onSharedDriveMappingsChange(parsed.mappings);
      } catch (e) {
        setDriveError(e instanceof Error ? e.message : "Invalid CSV format.");
        onSharedDriveMappingsChange([]);
      }
    },
    [onSharedDriveCsvChange, onSharedDriveMappingsChange]
  );

  const userUploaded = userMappings.length > 0;
  const sharedUploaded = sharedDriveMappings.length > 0;

  // At least one mapping must be uploaded. Scope is chosen in the next step.
  const canContinue = useMemo(() => {
    if (locked) return false;
    return userUploaded || sharedUploaded;
  }, [locked, sharedUploaded, userUploaded]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User & Shared Drive mappings</CardTitle>
          <CardDescription>
            Upload either or both CSV mappings. You'll choose what to migrate (My Drive, Shared Drives, or both) in the next step.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> User mapping</CardTitle>
          <CardDescription>
            CSV with <code className="text-xs bg-muted px-1 py-0.5 rounded">source,destination</code> emails (My Drive).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload accept=".csv" label="users.csv" file={csvFile} onFileChange={handleUserFile} disabled={locked} />
          {userError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {userError}
            </div>
          )}
          {csvFile && !userError && (
            <Button onClick={onUploadUserCsv} disabled={loading.uploadingMapping || loading.fetchingSizes || locked}>
              {loading.uploadingMapping ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : loading.fetchingSizes ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching sizes…</>
              ) : (
                "Upload to Flask & fetch sizes"
              )}
            </Button>
          )}
          {userUploaded && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source User</TableHead>
                    <TableHead className="text-right">Source Size</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Destination User</TableHead>
                    <TableHead className="text-right">Destination Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userMappings.slice(0, 10).map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{m.sourceUser}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtSize(m.sourceSizeGb)}</TableCell>
                      <TableCell><ArrowRight className="w-3 h-3 text-muted-foreground" /></TableCell>
                      <TableCell className="font-mono text-sm">{m.destinationUser}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtSize(m.destinationSizeGb)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {userMappings.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  …and {userMappings.length - 10} more users
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-primary" /> Shared Drive mapping</CardTitle>
          <CardDescription>
            CSV with <code className="text-xs bg-muted px-1 py-0.5 rounded">source,destination</code> drive IDs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload accept=".csv" label="shared_drives.csv" file={sharedDriveCsvFile} onFileChange={handleSharedFile} disabled={locked} />
          {driveError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {driveError}
            </div>
          )}
          {sharedDriveCsvFile && !driveError && (
            <Button onClick={onUploadSharedDriveCsv} disabled={loading.uploadingSharedDrive || locked}>
              {loading.uploadingSharedDrive ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                "Upload to Flask"
              )}
            </Button>
          )}
          {sharedUploaded && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Drive ID</TableHead>
                    <TableHead className="text-right">Source Size</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Destination Drive ID</TableHead>
                    <TableHead className="text-right">Destination Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharedDriveMappings.slice(0, 10).map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{m.sourceDriveId}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtSize(m.sourceSizeGb)}</TableCell>
                      <TableCell><ArrowRight className="w-3 h-3 text-muted-foreground" /></TableCell>
                      <TableCell className="font-mono text-xs">{m.destinationDriveId}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtSize(m.destinationSizeGb)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sharedDriveMappings.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  …and {sharedDriveMappings.length - 10} more drives
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onContinue} disabled={!canContinue}>Continue</Button>
      </div>
    </div>
  );
};

export default UserMappingStep;
