import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import FileUpload from "../FileUpload";
import type { DomainConfig } from "@/types/migration";
import { Globe, Loader2, Mail } from "lucide-react";

interface Props {
  config: DomainConfig;
  onChange: (config: DomainConfig) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

const DomainConfigStep = ({ config, onChange, onSubmit, isSubmitting }: Props) => {
  const update = (key: keyof DomainConfig, value: string | File | null) =>
    onChange({ ...config, [key]: value });

  const isValid =
    config.sourceDomain &&
    config.sourceAdminEmail &&
    config.sourceCredentials &&
    config.destinationDomain &&
    config.destinationAdminEmail &&
    config.destinationCredentials;

  return (
    <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Admin Email
            </label>
            <Input
              type="email"
              placeholder="admin@source-company.com"
              value={config.sourceAdminEmail}
              onChange={(e) => update("sourceAdminEmail", e.target.value)}
            />
          </div>
          <FileUpload
            accept=".json"
            label="Service Account Credentials"
            file={config.sourceCredentials}
            onFileChange={(f) => update("sourceCredentials", f)}
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Admin Email
            </label>
            <Input
              type="email"
              placeholder="admin@dest-company.com"
              value={config.destinationAdminEmail}
              onChange={(e) => update("destinationAdminEmail", e.target.value)}
            />
          </div>
          <FileUpload
            accept=".json"
            label="Service Account Credentials"
            file={config.destinationCredentials}
            onFileChange={(f) => update("destinationCredentials", f)}
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
