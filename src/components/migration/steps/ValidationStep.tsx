import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ConnectionStatus } from "@/types/migration";
import { CheckCircle2, XCircle, Loader2, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: ConnectionStatus;
  onValidate: () => void;
  onNext: () => void;
  onBack: () => void;
}

const StatusIcon = ({ s }: { s: "pending" | "success" | "error" | "loading" }) => {
  if (s === "loading") return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  if (s === "success") return <CheckCircle2 className="w-5 h-5 text-success" />;
  if (s === "error") return <XCircle className="w-5 h-5 text-destructive" />;
  return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
};

const ValidationStep = ({ status, onValidate, onNext, onBack }: Props) => {
  const [loading, setLoading] = useState(false);
  const allGood = status.source === "success" && status.destination === "success";

  const handleValidate = async () => {
    setLoading(true);
    await onValidate();
    setLoading(false);
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-primary" /> Connection Validation
        </CardTitle>
        <CardDescription>Test connectivity to both domains before migrating</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className={cn("flex items-center gap-3 p-4 rounded-lg border", status.source === "success" && "bg-success/5 border-success/30", status.source === "error" && "bg-destructive/5 border-destructive/30")}>
            <StatusIcon s={loading ? "loading" : status.source} />
            <div>
              <p className="font-medium text-sm">Source Connection</p>
              {status.sourceError && <p className="text-xs text-destructive mt-0.5">{status.sourceError}</p>}
            </div>
          </div>
          <div className={cn("flex items-center gap-3 p-4 rounded-lg border", status.destination === "success" && "bg-success/5 border-success/30", status.destination === "error" && "bg-destructive/5 border-destructive/30")}>
            <StatusIcon s={loading ? "loading" : status.destination} />
            <div>
              <p className="font-medium text-sm">Destination Connection</p>
              {status.destinationError && <p className="text-xs text-destructive mt-0.5">{status.destinationError}</p>}
            </div>
          </div>
        </div>

        <Button onClick={handleValidate} disabled={loading} className="w-full" size="lg">
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</> : "Test Connection"}
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
