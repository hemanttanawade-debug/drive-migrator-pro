import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import AppShell from "./components/layout/AppShell";
import MigrationWizard from "./components/migration/MigrationWizard";
import Dashboard from "./pages/Dashboard";
import LogScreen from "./pages/LogScreen";
import Settings from "./pages/Settings";
import { useMigrationWizard } from "./components/migration/useMigrationWizard";
import { MigrationProvider } from "./components/migration/MigrationContext";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  // Single shared wizard instance so Project, Dashboard, Logs and Settings see the same state.
  const wizard = useMigrationWizard();

  return (
    <MigrationProvider value={wizard}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<MigrationWizard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/logs" element={<LogScreen />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MigrationProvider>
  );
};

const AppRoutes = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return <ProtectedRoutes />;
};

const App = () => (
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </GoogleOAuthProvider>
);

export default App;
