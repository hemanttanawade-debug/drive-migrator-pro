import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMigrationContext } from "@/components/migration/MigrationContext";
import { useToast } from "@/hooks/use-toast";
import { resetAll } from "@/lib/api";
import { clearPersistedWizardState } from "@/components/migration/useMigrationWizard";

const Settings = () => {
  const { state } = useMigrationContext();
  const { toast } = useToast();
  const [purging, setPurging] = useState(false);

  const migrationId = state.migrationProgress.migrationId;
  const status = state.migrationProgress.status;
  const canDelete = true;

  const handleDeleteAll = async () => {
    setPurging(true);
    try {
      const res = await resetAll({ deleteAll: true });
      const sql = res.sql ?? { runs_deleted: 0, items_deleted: 0, folders_deleted: 0, permissions_deleted: 0, users_deleted: 0, error: null };
      toast({
        title: "All migration data deleted",
        description: `Files: ${res.files_deleted?.length ?? 0} · Runs: ${sql.runs_deleted} · Items: ${sql.items_deleted}`,
      });
      // Wipe persisted wizard inputs from this browser too.
      clearPersistedWizardState();
      // Soft refresh — easiest way to reset all client state too.
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Migration data</CardTitle>
          <CardDescription>
            Permanently delete everything: uploaded credentials, CSV mappings,
            session state, and ALL SQL rows for every migration run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Session</span><span className="font-mono text-xs">{state.sessionId || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current Migration ID</span><span className="font-mono text-xs">{migrationId || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{status}</span></div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Destructive action</p>
              <p className="text-muted-foreground mt-1">
                This wipes uploaded credentials, mapping CSVs, the session file, and every row in the
                migration SQL tables. Use this when you need to unlock and start clean.
              </p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!canDelete || purging} className="w-full">
                {purging ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</> : <><Trash2 className="w-4 h-4 mr-2" /> Delete all migration data</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete ALL migration data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every uploaded file, every session, and every row across migration_runs,
                  migration_items, migration_folder_mapping, migration_permissions, and migration_users
                  will be removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
