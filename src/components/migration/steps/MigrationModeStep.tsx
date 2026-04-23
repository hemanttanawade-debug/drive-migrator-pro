import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { MigrationConfig } from "@/types/migration";
import { HardDrive, Layers, Loader2, Play, RefreshCw, RotateCcw, Settings2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMigrationRuns, type MigrationRunRow } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  config: MigrationConfig;
  onChange: (config: MigrationConfig) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  locked?: boolean;
}

const scopeOptions: { value: MigrationConfig["scope"]; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "my-drive", label: "My Drive", desc: "Personal Drive files only", icon: <HardDrive className="w-5 h-5" /> },
  { value: "shared-drives", label: "Shared Drives", desc: "Shared Drives only", icon: <Share2 className="w-5 h-5" /> },
  { value: "both", label: "Both", desc: "My Drive + Shared Drives", icon: <Layers className="w-5 h-5" /> },
];

const scopeToMode = (scope: MigrationConfig["scope"]): MigrationConfig["mode"] => {
  if (scope === "shared-drives") return "shared-drives";
  if (scope === "both") return "full";
  return "custom";
};

const MigrationModeStep = ({ config, onChange, onSubmit, onBack, isSubmitting, locked }: Props) => {
  const isResume = config.mode === "resume";
  const { toast } = useToast();
  const [runs, setRuns] = useState<MigrationRunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const resumableRuns = runs.filter((r) => r.resumable);
  const isValid = !locked && (!isResume || (config.resumeMigrationId?.trim().length ?? 0) > 0);

  const fetchRuns = async () => {
    setLoadingRuns(true);
    try {
      const list = await listMigrationRuns();
      setRuns(list);
    } catch (e) {
      toast({
        title: "Could not load past runs",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    if (isResume) void fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume]);

  const setScope = (scope: MigrationConfig["scope"]) => {
    if (locked) return;
    onChange({
      ...config,
      scope,
      mode: isResume ? "resume" : scopeToMode(scope),
    });
  };

  const setStartFresh = () => {
    if (locked) return;
    onChange({ ...config, mode: scopeToMode(config.scope), resumeMigrationId: "" });
  };

  const setResume = () => {
    if (locked) return;
    onChange({ ...config, mode: "resume" });
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Migration Mode</CardTitle>
        <CardDescription>Choose what to migrate, then start fresh or resume a previous run.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scope selector */}
        <div>
          <p className="text-sm font-medium mb-2">What to migrate</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {scopeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                disabled={locked}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all",
                  config.scope === opt.value
                    ? "border-primary bg-primary/5 shadow-brand"
                    : "border-border hover:border-primary/40",
                  locked && "opacity-60 cursor-not-allowed"
                )}
              >
                <div className={cn(config.scope === opt.value ? "text-primary" : "text-muted-foreground")}>{opt.icon}</div>
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Start fresh vs Resume */}
        <div>
          <p className="text-sm font-medium mb-2">How to run</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={setStartFresh}
              disabled={locked}
              className={cn(
                "flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all",
                !isResume ? "border-primary bg-primary/5 shadow-brand" : "border-border hover:border-primary/40",
                locked && "opacity-60 cursor-not-allowed"
              )}
            >
              <Play className={cn("w-5 h-5", !isResume ? "text-primary" : "text-muted-foreground")} />
              <p className="font-medium text-sm">Start fresh</p>
              <p className="text-xs text-muted-foreground">Begin a new migration run.</p>
            </button>
            <button
              onClick={setResume}
              disabled={locked}
              className={cn(
                "flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all",
                isResume ? "border-primary bg-primary/5 shadow-brand" : "border-border hover:border-primary/40",
                locked && "opacity-60 cursor-not-allowed"
              )}
            >
              <RotateCcw className={cn("w-5 h-5", isResume ? "text-primary" : "text-muted-foreground")} />
              <p className="font-medium text-sm">Resume</p>
              <p className="text-xs text-muted-foreground">Continue a previous interrupted migration.</p>
            </button>
          </div>

          {isResume && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium">Pick a run to resume</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={fetchRuns}
                  disabled={loadingRuns || locked}
                  className="h-7 px-2"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loadingRuns && "animate-spin")} />
                  Refresh
                </Button>
              </div>

              {loadingRuns ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2 p-3 border rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading past runs…
                </div>
              ) : resumableRuns.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border rounded-md">
                  No resumable runs found. A run is resumable when it has pending or failed items.
                </div>
              ) : (
                <Select
                  value={config.resumeMigrationId || ""}
                  onValueChange={(v) => onChange({ ...config, resumeMigrationId: v })}
                  disabled={locked}
                >
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
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onSubmit} disabled={!isValid || isSubmitting || locked}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save & Continue"}
          </Button>
        </div>

        {locked && (
          <p className="text-xs text-muted-foreground text-center">
            Migration is currently running — stop it before starting a new one.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MigrationModeStep;
