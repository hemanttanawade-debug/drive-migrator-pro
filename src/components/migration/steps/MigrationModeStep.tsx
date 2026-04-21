import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MigrationConfig } from "@/types/migration";
import { HardDrive, Layers, Loader2, Play, RotateCcw, Settings2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const isValid = !locked && (!isResume || (config.resumeMigrationId?.trim().length ?? 0) > 0);

  const setScope = (scope: MigrationConfig["scope"]) => {
    if (locked) return;
    // Preserve resume choice when switching scope
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
              <p className="text-xs text-muted-foreground">Continue a previous migration by ID.</p>
            </button>
          </div>

          {isResume && (
            <div className="mt-3">
              <label className="block text-sm font-medium mb-1.5">Migration ID</label>
              <Input
                placeholder="Enter the migration ID to resume"
                value={config.resumeMigrationId || ""}
                onChange={(e) => onChange({ ...config, resumeMigrationId: e.target.value })}
                disabled={locked}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MigrationModeStep;
