import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MigrationProgress } from "@/types/migration";
import { Download, RotateCcw, FileText } from "lucide-react";
import { downloadLogs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  progress: MigrationProgress;
  onDownloadReport: () => void;
  onRetry: () => void;
  onBack: () => void;
}

const LogsReportsStep = ({ progress, onDownloadReport, onRetry, onBack }: Props) => {
  const { toast } = useToast();

  const handleLogs = async () => {
    try {
      const blob = await downloadLogs(progress.migrationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `migration-${progress.migrationId}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Could not download logs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Logs & Reports
          </CardTitle>
          <CardDescription>Migration ID: {progress.migrationId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
              <p className="text-2xl font-bold text-success">{progress.filesMigrated}</p>
              <p className="text-xs text-muted-foreground">Files Migrated</p>
            </div>
            <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
              <p className="text-2xl font-bold text-destructive">{progress.failedFiles}</p>
              <p className="text-xs text-muted-foreground">Failed Files</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{progress.totalUsers}</p>
              <p className="text-xs text-muted-foreground">Users Processed</p>
            </div>
          </div>

          <div className="bg-foreground/[0.03] border rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-0.5">
            {progress.logs.length > 0 ? (
              progress.logs.map((log, i) => <p key={i} className="text-muted-foreground">{log}</p>)
            ) : (
              <p className="text-muted-foreground italic">No logs available</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button onClick={onDownloadReport}>
              <Download className="w-4 h-4 mr-2" /> Download Report (CSV)
            </Button>
            <Button variant="outline" onClick={handleLogs}>
              <Download className="w-4 h-4 mr-2" /> Download Log (TXT)
            </Button>
          </div>

          {progress.failedFiles > 0 && (
            <Button variant="outline" onClick={onRetry} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" /> Retry Failed Files
            </Button>
          )}

          <div className="flex justify-start">
            <Button variant="outline" onClick={onBack}>Back</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogsReportsStep;
