import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, RefreshCw, Users, CheckCircle2, Loader2, XCircle, HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadLogs, downloadReport, getDashboard } from "@/lib/api";
import { useMigrationContext } from "@/components/migration/MigrationContext";
import { useToast } from "@/hooks/use-toast";
import type { DashboardSummary } from "@/types/migration";
import { cn } from "@/lib/utils";

const statusBadge: Record<DashboardSummary["rows"][number]["status"], string> = {
  completed: "bg-success/10 text-success",
  running: "bg-info/10 text-info",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

const Dashboard = () => {
  const { state } = useMigrationContext();
  const { toast } = useToast();
  const migrationId = state.migrationProgress.migrationId;
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await getDashboard(migrationId || undefined));
    } catch (e) {
      toast({ title: "Could not load dashboard", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // No auto-polling — user explicitly clicks "Sync" / Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationId]);

  const handleReport = async () => {
    if (!migrationId) return;
    try {
      const blob = await downloadReport(migrationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `migration-${migrationId}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Report download failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const handleLogs = async () => {
    if (!migrationId) return;
    try {
      const blob = await downloadLogs(migrationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `migration-${migrationId}.log`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Log download failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  const filesPct = data.filesTotal > 0 ? Math.round((data.filesMigrated / data.filesTotal) * 100) : 0;
  const dataPct = data.dataTotalGb > 0 ? Math.round((data.dataTransferredGb / data.dataTotalGb) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Live aggregates for the current migration</p>
          {migrationId ? (
            <p className="text-xs font-mono text-muted-foreground mt-1">id: {migrationId}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No active migration yet — start one from the Project page.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", loading && "animate-spin")} /> Sync
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogs} disabled={!migrationId}>
            <FileText className="w-3.5 h-3.5 mr-2" /> Log (.txt)
          </Button>
          <Button size="sm" onClick={handleReport} disabled={!migrationId}>
            <Download className="w-3.5 h-3.5 mr-2" /> Report (.csv)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Users className="w-4 h-4" />} label="Total Users" value={data.totalUsers.toString()} />
        <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-success" />} label="Completed" value={data.completed.toString()} accent="success" />
        <KpiCard icon={<Loader2 className="w-4 h-4 text-info" />} label="In Progress" value={data.inProgress.toString()} accent="info" />
        <KpiCard icon={<XCircle className="w-4 h-4 text-destructive" />} label="Failed" value={data.failed.toString()} accent="destructive" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" /> Files Migrated
            </CardTitle>
            <CardDescription>{data.filesMigrated.toLocaleString()} / {data.filesTotal.toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={filesPct} className="h-2" />
            <p className="text-xs text-muted-foreground text-right mt-1.5">{filesPct}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-muted-foreground" /> Data Transferred
            </CardTitle>
            <CardDescription>{data.dataTransferredGb.toFixed(1)} GB / {data.dataTotalGb.toFixed(1)} GB</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={dataPct} className="h-2" />
            <p className="text-xs text-muted-foreground text-right mt-1.5">{dataPct}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per-user progress</CardTitle>
          <CardDescription>Source → Destination</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source → Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Progress</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                    No user progress yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-mono text-xs">{r.sourceUser}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.destinationUser}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize", statusBadge[r.status])}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Progress value={r.progressPct} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground mt-1">{r.progressPct}%</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.filesDone.toLocaleString()}/{r.filesTotal.toLocaleString()}
                      {r.filesFailed > 0 && (
                        <span className="text-destructive text-xs ml-1">({r.filesFailed} failed)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.sizeDoneGb.toFixed(1)} GB / {r.sizeTotalGb.toFixed(1)} GB
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const KpiCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "success" | "info" | "destructive" }) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn(
        "text-3xl font-bold tabular-nums",
        accent === "success" && "text-success",
        accent === "info" && "text-info",
        accent === "destructive" && "text-destructive"
      )}>{value}</p>
    </CardContent>
  </Card>
);

export default Dashboard;
