import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/migration/AppLogo";

const LoginPage = () => {
  const { handleGoogleSuccess } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError(null);
    try {
      await handleGoogleSuccess(credentialResponse.credential);
    } catch (e: any) {
      const msg = e?.message || "You are not authorized to use this app.";
      setError(msg);
      toast({
        title: "Sign-in failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onFailure = () => {
    const msg = "Google sign-in was cancelled or failed. Please try again.";
    setError(msg);
    toast({ title: "Sign-in failed", description: msg, variant: "destructive" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-sm shadow-soft">
        <AppLogo size="lg" showText={false} />

        <div className="text-center">
          <h1 className="text-xl font-semibold">Drive Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in with your company account
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Verifying access…
          </div>
        ) : (
          <GoogleLogin
            onSuccess={onSuccess}
            onError={onFailure}
            useOneTap
            auto_select={false}
          />
        )}

        {error && (
          <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-destructive">{error}</p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-1 text-destructive"
                onClick={() => { setError(null); }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Access restricted to authorized users only.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
