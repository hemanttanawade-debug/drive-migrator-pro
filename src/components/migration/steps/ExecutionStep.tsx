import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { MigrationProgress, ScanSummary } from "@/types/migration";
import { Play, Loader2, Copy, CheckCircle2, Search, Files, Folder, HardDrive, Clock, Download, RotateCcw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadLogs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  progress: MigrationProgress;
  scan: ScanSummary;
  onScan: () => void;
  onStart: () => void;
  onBack: () => void;
  onDownloadReport: () => void;
  onRetry: () => void;
  loading: { scanning: boolean; startingMigration: boolean };
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const ExecutionStep = ({ progress, scan, onScan, onStart, onBack, onDownloadReport, onRetry, loading }: Props) => {
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.logs]);

  const totalUnits = scan.totalFiles || progress.totalUsers * 10;
  const pct = totalUnits > 0
    ? Math.min(100, Math.round(((progress.filesMigrated + progress.failedFiles) / totalUnits) * 100))
    : 0;

  const copyId = () => {
    navigator.clipboard.writeText(progress.migrationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunning = progress.status === "running";
  const isDone = progress.status === "completed" || progress.status === "failed";

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
          <CardTitle className="flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Pre-migration scan</CardTitle>
          <CardDescription>List all mapped files and folders, total size and an estimated runtime before starting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={onScan} disabled={loading.scanning || isRunning} className="w-full" variant={scan.scanned ? "outline" : "default"}>
            {loading.scanning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning…</>
            ) : scan.scanned ? (
              "Re-run scan"
            ) : (
              <>List & estimate (read-only)</>
            )}
          </Button>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Files className="w-4 h-4" />} label="Total files" value={scan.totalFiles.toLocaleString()} />
            <Stat icon={<Folder className="w-4 h-4" />} label="Total folders" value={scan.totalFolders.toLocaleString()} />
            <Stat icon={<HardDrive className="w-4 h-4" />} label="Total size" value={`${scan.totalSizeGb.toFixed(2)} GB`} />
            <Stat icon={<Clock className="w-4 h-4" />} label="Estimated time" value={`${scan.estimateDays}d ${scan.estimateHours}h`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Migration Execution</CardTitle>
          <Badge className={cn("capitalize", statusColors[progress.status])}>{progress.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {progress.migrationId && (
            <div className="flex items-center gap-2 text-sm bg-muted p-3 rounded-lg">
              <span className="text-muted-foreground">Migration ID:</span>
              <code className="font-mono font-medium">{progress.migrationId}</code>
              <button onClick={copyId} className="ml-auto text-muted-foreground hover:text-foreground">
                {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Users", value: progress.totalUsers },
              { label: "Files Migrated", value: progress.filesMigrated },
              { label: "Failed Files", value: progress.failedFiles },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {(isRunning || isDone) && (
            <div className="space-y-1.5">
              <Progress value={pct} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{pct}%</p>
            </div>
          )}

          {progress.logs.length > 0 && (
            <div ref={logRef} className="bg-foreground/[0.03] border rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-xs space-y-0.5">
              {progress.logs.map((log, i) => (
                <p key={i} className="text-muted-foreground">{log}</p>
              ))}
            </div>
          )}

          {progress.status === "pending" && (
            <Button
              onClick={onStart}
              className="w-full"
              size="lg"
              disabled={!scan.scanned || loading.startingMigration}
              title={!scan.scanned ? "Run a scan first" : ""}
            >
              {loading.startingMigration ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Start Migration</>
              )}
            </Button>
          )}
          {isRunning && (
            <Button disabled className="w-full" size="lg">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migration in Progress…
            </Button>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack} disabled={isRunning}>Back</Button>
          </div>
        </CardContent>
      </Card>

      {isDone && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Logs & Reports
            </CardTitle>
            <CardDescription>Migration ID: {progress.migrationId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-lg border bg-card p-3">
    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">{icon}<span>{label}</span></div>
    <p className="text-lg font-semibold tabular-nums">{value}</p>
  </div>
);

export default ExecutionStep;
