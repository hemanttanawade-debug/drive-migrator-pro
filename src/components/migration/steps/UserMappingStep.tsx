import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FileUpload from "../FileUpload";
import type { UserMapping } from "@/types/migration";
import { Users, AlertCircle } from "lucide-react";

interface Props {
  csvFile: File | null;
  mappings: UserMapping[];
  onFileChange: (file: File | null) => void;
  onMappingsChange: (mappings: UserMapping[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const UserMappingStep = ({ csvFile, mappings, onFileChange, onMappingsChange, onNext, onBack }: Props) => {
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | null) => {
      setError(null);
      onFileChange(file);
      if (!file) {
        onMappingsChange([]);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.trim().split("\n");
        if (lines.length < 2) {
          setError("CSV must have a header row and at least one data row");
          return;
        }
        const header = lines[0].toLowerCase();
        if (!header.includes("source") || !header.includes("destination")) {
          setError("CSV must have source_user and destination_user columns");
          return;
        }
        const parsed: UserMapping[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim());
          if (cols.length >= 2 && cols[0] && cols[1]) {
            parsed.push({ sourceUser: cols[0], destinationUser: cols[1] });
          }
        }
        if (parsed.length === 0) {
          setError("No valid mappings found in CSV");
          return;
        }
        onMappingsChange(parsed);
      };
      reader.readAsText(file);
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
          Upload a CSV with <code className="text-xs bg-muted px-1 py-0.5 rounded">source_user,destination_user</code> columns
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
          <Button onClick={onNext} disabled={mappings.length === 0}>Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserMappingStep;
