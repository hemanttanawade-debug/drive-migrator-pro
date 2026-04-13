import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { MigrationProgress, MigrationConfig } from "@/types/migration";
import { Play, Loader2, Copy, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  progress: MigrationProgress;
  migrationConfig: MigrationConfig;
  onStart: () => void;
  onNext: () => void;
  onBack: () => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const ExecutionStep = ({ progress, migrationConfig, onStart, onNext, onBack }: Props) => {
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.logs]);

  const total = progress.filesMigrated + progress.failedFiles;
  const pct = progress.totalUsers > 0 ? Math.round((total / (progress.totalUsers * 10)) * 100) : 0;

  const copyId = () => {
    navigator.clipboard.writeText(progress.migrationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunning = progress.status === "running";
  const isDone = progress.status === "completed" || progress.status === "failed";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Migration Execution</CardTitle>
          <Badge className={cn("capitalize", statusColors[progress.status])}>
            {progress.status}
          </Badge>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: progress.totalUsers },
              { label: "Files Migrated", value: progress.filesMigrated },
              { label: "Failed Files", value: progress.failedFiles },
              { label: "Mode", value: migrationConfig.mode },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {isRunning && (
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
            <Button onClick={onStart} className="w-full" size="lg">
              <Play className="w-4 h-4 mr-2" /> Start Migration
            </Button>
          )}
          {isRunning && (
            <Button disabled className="w-full" size="lg">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migration in Progress...
            </Button>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack} disabled={isRunning}>Back</Button>
            <Button onClick={onNext} disabled={!isDone}>View Logs & Reports</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExecutionStep;
