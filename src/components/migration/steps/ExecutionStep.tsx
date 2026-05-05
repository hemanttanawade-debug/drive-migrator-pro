import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MigrationProgress, ScanSummary } from "@/types/migration";
import {
  Play, Loader2, Copy, CheckCircle2, Search, Files, Folder, HardDrive, Clock, Download,
  RotateCcw, FileText, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadLogs, listMigrationRuns, type MigrationRunRow } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  progress: MigrationProgress;
  scan: ScanSummary;
  onScan: () => void;
  onStart: () => void;
  onResume: (runId: string) => void;
  onSync: () => void;
  onBack: () => void;
  onDownloadReport: () => void;
  onRetry: () => void;
  loading: { scanning: boolean; startingMigration: boolean; syncing?: boolean; resuming?: boolean };
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const ExecutionStep = ({
  progress, scan, onScan, onStart, onResume, onSync, onBack,
  onDownloadReport, onRetry, loading,
}: Props) => {
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [runs, setRuns] = useState<MigrationRunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [loadingRuns, setLoadingRuns] = useState(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.logs]);

  const sizeDone = progress.dataTransferredGb ?? 0;
  const sizeTotal = progress.dataTotalGb ?? scan.totalSizeGb ?? 0;
  const filesDone = progress.filesDone ?? (progress.filesMigrated + progress.failedFiles);
  const filesTotal = progress.filesTotal ?? scan.totalFiles ?? 0;

  const pct = sizeTotal > 0
    ? Math.min(100, Math.round((sizeDone / sizeTotal) * 100))
    : filesTotal > 0
      ? Math.min(100, Math.round((filesDone / filesTotal) * 100))
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

  const fetchRuns = async () => {
    setLoadingRuns(true);
    try {
      const list = await listMigrationRuns();
      setRuns(list);
    } catch (e) {
      toast({ title: "Could not load past runs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => { void fetchRuns(); }, []);

  const resumableRuns = runs.filter((r) => r.resumable || r.pending > 0);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Pre-migration scan</CardTitle>
          <CardDescription>List all mapped files and folders, total size and an estimated runtime before starting a fresh migration. Not required for Resume.</CardDescription>
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onSync} disabled={loading.syncing} className="h-8">
              <RefreshCw className={cn("w-4 h-4 mr-1", loading.syncing && "animate-spin")} /> Sync
            </Button>
            <Badge className={cn("capitalize", statusColors[progress.status])}>{progress.status}</Badge>
          </div>
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

          {(isRunning || isDone || sizeTotal > 0) && (
            <div className="space-y-1.5">
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {sizeTotal > 0
                    ? `${sizeDone.toFixed(2)} GB / ${sizeTotal.toFixed(2)} GB`
                    : `${filesDone.toLocaleString()} / ${filesTotal.toLocaleString()} files`}
                </span>
                <span>{pct}%</span>
              </div>
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

      {/* Resume previous migration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" /> Resume a previous migration
          </CardTitle>
          <CardDescription>
            Pick a previous run to continue from where it stopped. No re-scan needed — the file list is already in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {resumableRuns.length} resumable run{resumableRuns.length === 1 ? "" : "s"}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={fetchRuns} disabled={loadingRuns} className="h-7 px-2">
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loadingRuns && "animate-spin")} /> Refresh
            </Button>
          </div>

          {loadingRuns ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 border rounded-md">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading past runs…
            </div>
          ) : resumableRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 border rounded-md">
              No resumable runs found. A run becomes resumable when it has pending or failed items.
            </div>
          ) : (
            <Select value={selectedRun} onValueChange={setSelectedRun}>
              <SelectTrigger>
                <SelectValue placeholder="Select a previous run" />
              </SelectTrigger>
              <SelectContent>
                {resumableRuns.map((r) => (
                  <SelectItem key={r.run_id} value={r.run_id}>
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{r.run_id}</span>
                        <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {r.done}/{r.done + r.pending} files done · {r.pending} pending
                        {r.start_time ? ` · ${new Date(r.start_time).toLocaleString()}` : ""}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            className="w-full"
            onClick={() => onResume(selectedRun)}
            disabled={!selectedRun || isRunning || loading.resuming}
          >
            {loading.resuming ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resuming…</>
            ) : (
              <><RotateCcw className="w-4 h-4 mr-2" /> Resume Migration</>
            )}
          </Button>
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
                <Download className="w-4 h-4 mr-2" /> Download Report (ZIP)
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
