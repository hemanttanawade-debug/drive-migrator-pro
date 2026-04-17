import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import FileUpload from "../FileUpload";
import type { DomainConfig } from "@/types/migration";
import { Globe, Loader2, Mail, Lock } from "lucide-react";
import { useMemo } from "react";
import { isValidDomain, isValidEmail, emailMatchesDomain } from "@/lib/validators";
import { cn } from "@/lib/utils";

interface Props {
  config: DomainConfig;
  onChange: (config: DomainConfig) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  locked?: boolean;
}

interface FieldErrors {
  sourceDomain?: string;
  sourceAdminEmail?: string;
  destinationDomain?: string;
  destinationAdminEmail?: string;
}

const DomainConfigStep = ({ config, onChange, onSubmit, isSubmitting, locked }: Props) => {
  const update = (key: keyof DomainConfig, value: string | File | null) =>
    onChange({ ...config, [key]: value });

  const errors = useMemo<FieldErrors>(() => {
    const e: FieldErrors = {};
    if (config.sourceDomain && !isValidDomain(config.sourceDomain)) e.sourceDomain = "Enter a valid domain (e.g. company.com).";
    if (config.destinationDomain && !isValidDomain(config.destinationDomain)) e.destinationDomain = "Enter a valid domain (e.g. company.com).";
    if (config.sourceAdminEmail) {
      if (!isValidEmail(config.sourceAdminEmail)) e.sourceAdminEmail = "Enter a valid email address.";
      else if (config.sourceDomain && isValidDomain(config.sourceDomain) && !emailMatchesDomain(config.sourceAdminEmail, config.sourceDomain)) {
        e.sourceAdminEmail = "Admin email must belong to the source domain.";
      }
    }
    if (config.destinationAdminEmail) {
      if (!isValidEmail(config.destinationAdminEmail)) e.destinationAdminEmail = "Enter a valid email address.";
      else if (config.destinationDomain && isValidDomain(config.destinationDomain) && !emailMatchesDomain(config.destinationAdminEmail, config.destinationDomain)) {
        e.destinationAdminEmail = "Admin email must belong to the destination domain.";
      }
    }
    return e;
  }, [config]);

  const isValid =
    !locked &&
    config.sourceDomain && config.sourceAdminEmail && config.sourceCredentials &&
    config.destinationDomain && config.destinationAdminEmail && config.destinationCredentials &&
    Object.keys(errors).length === 0;

  const fieldClass = (err?: string) =>
    cn(err && "border-destructive focus-visible:ring-destructive");

  return (
    <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
      {locked && (
        <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning-foreground">
          <Lock className="h-4 w-4 text-warning" />
          <span className="text-foreground">Migration is running — project details are read-only.</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-primary" /> Source Domain
          </CardTitle>
          <CardDescription>Configure the source Google Workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Domain</label>
            <Input
              placeholder="source-company.com"
              value={config.sourceDomain}
              onChange={(e) => update("sourceDomain", e.target.value)}
              disabled={locked}
              className={fieldClass(errors.sourceDomain)}
            />
            {errors.sourceDomain && <p className="text-xs text-destructive mt-1">{errors.sourceDomain}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Admin Email
            </label>
            <Input
              type="email"
              placeholder="admin@source-company.com"
              value={config.sourceAdminEmail}
              onChange={(e) => update("sourceAdminEmail", e.target.value)}
              disabled={locked}
              className={fieldClass(errors.sourceAdminEmail)}
            />
            {errors.sourceAdminEmail && <p className="text-xs text-destructive mt-1">{errors.sourceAdminEmail}</p>}
          </div>
          <FileUpload
            accept=".json"
            label="Service Account Credentials"
            file={config.sourceCredentials}
            onFileChange={(f) => update("sourceCredentials", f)}
            disabled={locked}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-success" /> Destination Domain
          </CardTitle>
          <CardDescription>Configure the destination Google Workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Domain</label>
            <Input
              placeholder="dest-company.com"
              value={config.destinationDomain}
              onChange={(e) => update("destinationDomain", e.target.value)}
              disabled={locked}
              className={fieldClass(errors.destinationDomain)}
            />
            {errors.destinationDomain && <p className="text-xs text-destructive mt-1">{errors.destinationDomain}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Admin Email
            </label>
            <Input
              type="email"
              placeholder="admin@dest-company.com"
              value={config.destinationAdminEmail}
              onChange={(e) => update("destinationAdminEmail", e.target.value)}
              disabled={locked}
              className={fieldClass(errors.destinationAdminEmail)}
            />
            {errors.destinationAdminEmail && <p className="text-xs text-destructive mt-1">{errors.destinationAdminEmail}</p>}
          </div>
          <FileUpload
            accept=".json"
            label="Service Account Credentials"
            file={config.destinationCredentials}
            onFileChange={(f) => update("destinationCredentials", f)}
            disabled={locked}
          />
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={onSubmit} disabled={!isValid || isSubmitting} size="lg">
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save & Continue"}
        </Button>
      </div>
    </div>
  );
};

export default DomainConfigStep;
