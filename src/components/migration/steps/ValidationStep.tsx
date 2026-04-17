import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionStatus } from "@/types/migration";
import { CheckCircle2, XCircle, Loader2, Plug, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: ConnectionStatus;
  onValidate: () => void;
  onNext: () => void;
  onBack: () => void;
  isValidating: boolean;
}

const StatusIcon = ({ s }: { s: "pending" | "loading" | "success" | "error" }) => {
  if (s === "loading") return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  if (s === "success") return <CheckCircle2 className="w-5 h-5 text-success" />;
  if (s === "error") return <XCircle className="w-5 h-5 text-destructive" />;
  return <Circle className="w-5 h-5 text-muted-foreground/40" />;
};

const ValidationStep = ({ status, onValidate, onNext, onBack, isValidating }: Props) => {
  const allGood = status.checks.every((c) => c.status === "success");

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-primary" /> Pre-flight Validation
        </CardTitle>
        <CardDescription>Run the four enterprise readiness checks before continuing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2.5">
          {status.checks.map((chk) => (
            <div
              key={chk.key}
              className={cn(
                "flex items-start gap-3 p-3.5 rounded-lg border transition-colors",
                chk.status === "success" && "bg-success/5 border-success/30",
                chk.status === "error" && "bg-destructive/5 border-destructive/30",
                chk.status === "loading" && "bg-primary/5 border-primary/20",
                chk.status === "pending" && "border-border"
              )}
            >
              <StatusIcon s={chk.status} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{chk.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{chk.description}</p>
                {chk.error && (
                  <p className="text-xs text-destructive mt-1.5 font-mono break-all">{chk.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={onValidate} disabled={isValidating} className="w-full" size="lg">
          {isValidating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running checks...</>
          ) : (
            "Run Validation"
          )}
        </Button>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={!allGood}>Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ValidationStep;
