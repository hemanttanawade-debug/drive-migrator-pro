import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MigrationConfig } from "@/types/migration";
import { Loader2, RotateCcw, Settings2 } from "lucide-react";

interface Props {
  config: MigrationConfig;
  onChange: (config: MigrationConfig) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  locked?: boolean;
}

const scopeLabel: Record<MigrationConfig["scope"], string> = {
  "my-drive": "My Drive only (--mode custom)",
  "shared-drives": "Shared Drives only (--mode shared-drives)",
  both: "My Drive + Shared Drives (--mode full)",
};

const MigrationModeStep = ({ config, onChange, onSubmit, onBack, isSubmitting, locked }: Props) => {
  const isResume = config.mode === "resume";
  const isValid = !locked && (!isResume || (config.resumeMigrationId?.trim().length ?? 0) > 0);

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Migration Mode</CardTitle>
        <CardDescription>Confirm what we'll send to Flask, or resume a previous migration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-primary-soft/40 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Selected scope</p>
          <p className="font-medium text-sm mt-1">{scopeLabel[config.scope]}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Change scope from the previous step if needed.
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Resume a failed migration instead</p>
            </div>
            <Button
              size="sm"
              variant={isResume ? "default" : "outline"}
              onClick={() => onChange({ ...config, mode: isResume ? (config.scope === "shared-drives" ? "shared-drives" : config.scope === "both" ? "full" : "custom") : "resume" })}
              disabled={locked}
            >
              {isResume ? "Disable" : "Enable"}
            </Button>
          </div>

          {isResume && (
            <div>
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
