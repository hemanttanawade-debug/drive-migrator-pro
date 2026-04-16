import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const LoginPage = () => {
  const { handleGoogleSuccess } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      await handleGoogleSuccess(credentialResponse.credential);
    } catch (e: any) {
      toast({
        title: "Access denied",
        description: e.message || "You are not authorized to use this app.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card border rounded-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-lg">GW</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">GWS Drive Migration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in with your company account
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        ) : (
          <GoogleLogin
            onSuccess={onSuccess}
            onError={() =>
              toast({ title: "Google sign-in failed", variant: "destructive" })
            }
            useOneTap
            auto_select={false}
          />
        )}

        <p className="text-xs text-muted-foreground text-center">
          Access restricted to authorized users only.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;