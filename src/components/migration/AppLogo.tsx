import { ArrowRightLeft, ShieldCheck } from "lucide-react";

const AppLogo = () => {
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-info/10 to-success/15 shadow-brand">
        <div className="absolute inset-[5px] rounded-[1rem] border border-border/70 bg-card/90" />
        <div className="absolute left-2.5 top-2.5 h-3.5 w-3.5 rounded-md border border-primary/20 bg-primary/15" />
        <div className="absolute right-2.5 bottom-2.5 h-3.5 w-3.5 rounded-md border border-success/20 bg-success/15" />
        <ArrowRightLeft className="relative z-10 h-4.5 w-4.5 text-primary" />
      </div>

      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">GWS Drive Migration</h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            Enterprise
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Secure domain-to-domain migration workflow</p>
      </div>
    </div>
  );
};

export default AppLogo;