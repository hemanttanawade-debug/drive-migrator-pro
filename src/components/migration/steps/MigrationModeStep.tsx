import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MigrationConfig, MigrationMode } from "@/types/migration";
import { HardDrive, Share2, Layers, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  config: MigrationConfig;
  onChange: (config: MigrationConfig) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const modes: { value: MigrationMode; label: string; desc: string; icon: React.ReactNode; cmd: string }[] = [
  { value: "custom", label: "My Drive Only", desc: "Migrate personal Drive files for mapped users", icon: <HardDrive className="w-5 h-5" />, cmd: "--mode custom" },
  { value: "shared-drives", label: "Shared Drives Only", desc: "Migrate all Shared Drives between domains", icon: <Share2 className="w-5 h-5" />, cmd: "--mode shared-drives" },
  { value: "full", label: "Complete Migration", desc: "Migrate both My Drive and Shared Drives", icon: <Layers className="w-5 h-5" />, cmd: "--mode full" },
  { value: "resume", label: "Resume Failed", desc: "Resume a previously failed migration by ID", icon: <RotateCcw className="w-5 h-5" />, cmd: "--mode resume" },
];

const MigrationModeStep = ({ config, onChange, onSubmit, onBack, isSubmitting }: Props) => {
  const isValid = config.mode !== "resume" || (config.resumeMigrationId && config.resumeMigrationId.trim().length > 0);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Migration Mode</CardTitle>
        <CardDescription>Choose what to migrate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => onChange({ ...config, mode: m.value })}
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg border text-left transition-all",
                config.mode === m.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className={cn("mt-0.5", config.mode === m.value ? "text-primary" : "text-muted-foreground")}>
                {m.icon}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                <code className="text-[10px] text-muted-foreground/70 mt-1 block font-mono">{m.cmd}</code>
              </div>
              <div className={cn("w-4 h-4 rounded-full border-2 mt-1 shrink-0", config.mode === m.value ? "border-primary bg-primary" : "border-muted-foreground/30")} />
            </button>
          ))}
        </div>

        {config.mode === "resume" && (
          <div className="pl-9">
            <label className="block text-sm font-medium mb-1.5">Migration ID</label>
            <Input
              placeholder="Enter migration ID to resume"
              value={config.resumeMigrationId || ""}
              onChange={(e) => onChange({ ...config, resumeMigrationId: e.target.value })}
            />
          </div>
        )}

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
