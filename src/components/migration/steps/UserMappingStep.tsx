import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FileUpload from "../FileUpload";
import type { UserMapping } from "@/types/migration";
import { Users, AlertCircle, Loader2 } from "lucide-react";
import { parseUserMappingCsv } from "../user-mapping-utils";

interface Props {
  csvFile: File | null;
  mappings: UserMapping[];
  onFileChange: (file: File | null) => void;
  onMappingsChange: (mappings: UserMapping[]) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const UserMappingStep = ({ csvFile, mappings, onFileChange, onMappingsChange, onSubmit, onBack, isSubmitting }: Props) => {
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | null) => {
      setError(null);
      onFileChange(file);
      if (!file) {
        onMappingsChange([]);
        return;
      }

      try {
        const parsed = parseUserMappingCsv(await file.text());
        onMappingsChange(parsed.mappings);
      } catch (csvError) {
        setError(csvError instanceof Error ? csvError.message : "Invalid CSV format.");
        onMappingsChange([]);
      }
    },
    [onFileChange, onMappingsChange]
  );

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> User Mapping
        </CardTitle>
        <CardDescription>
          Upload a CSV with <code className="text-xs bg-muted px-1 py-0.5 rounded">source,destination</code> or <code className="text-xs bg-muted px-1 py-0.5 rounded">source_user,destination_user</code> columns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileUpload accept=".csv" label="Users CSV File" file={csvFile} onFileChange={handleFile} />

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {mappings.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source User</TableHead>
                  <TableHead>Destination User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.slice(0, 10).map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{m.sourceUser}</TableCell>
                    <TableCell className="font-mono text-sm">{m.destinationUser}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {mappings.length > 10 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                ...and {mappings.length - 10} more users
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onSubmit} disabled={mappings.length === 0 || isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : "Upload & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserMappingStep;
