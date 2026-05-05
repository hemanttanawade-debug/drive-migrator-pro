import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MigrationConfig } from "@/types/migration";
import { HardDrive, Layers, Loader2, Settings2, Share2 } from "lucide-react";
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
  const setScope = (scope: MigrationConfig["scope"]) => {
    if (locked) return;
    onChange({ ...config, scope, mode: scopeToMode(scope), resumeMigrationId: "" });
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Migration Mode</CardTitle>
        <CardDescription>Choose what to migrate. You can resume a previous run from the Execution step.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onSubmit} disabled={isSubmitting || locked}>
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
