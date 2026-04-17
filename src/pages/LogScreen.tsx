import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2, Download } from "lucide-react";
import { downloadLogs, getMigrationStatus } from "@/lib/api";
import { useMigrationContext } from "@/components/migration/MigrationContext";
import { useToast } from "@/hooks/use-toast";

const LogScreen = () => {
  const { state } = useMigrationContext();
  const { toast } = useToast();
  const migrationId = state.migrationProgress.migrationId;
  const [logs, setLogs] = useState<string[]>(state.migrationProgress.logs);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!migrationId || paused) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getMigrationStatus(migrationId);
        if (!cancelled && res.logs.length > 0) setLogs(res.logs);
      } catch {
        /* ignore transient polling errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [migrationId, paused]);

  useEffect(() => {
    if (containerRef.current && !paused) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const handleDownload = async () => {
    if (!migrationId) return;
    try {
      const blob = await downloadLogs(migrationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `migration-${migrationId}.log`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Could not download logs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Live migration log</CardTitle>
          <CardDescription>
            {migrationId ? <>Streaming from Flask • <code className="font-mono text-xs">{migrationId}</code></> : "No active migration."}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)} disabled={!migrationId}>
            {paused ? <><Play className="w-3.5 h-3.5 mr-2" /> Resume</> : <><Pause className="w-3.5 h-3.5 mr-2" /> Pause</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLogs([])} disabled={logs.length === 0}>
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Clear view
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!migrationId}>
            <Download className="w-3.5 h-3.5 mr-2" /> Download .log
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="bg-foreground/[0.04] border rounded-lg p-4 h-[60vh] overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground italic">No logs yet.</p>
          ) : (
            logs.map((line, i) => <p key={i} className="text-muted-foreground whitespace-pre-wrap">{line}</p>)
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogScreen;
