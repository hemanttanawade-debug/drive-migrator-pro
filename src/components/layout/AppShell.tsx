import { Outlet, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ScrollText, Settings, LogOut } from "lucide-react";
import AppLogo from "@/components/migration/AppLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Project", icon: FolderKanban, end: true },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/logs", label: "Log Screen", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

const titleMap: Record<string, string> = {
  "/": "Project",
  "/dashboard": "Dashboard",
  "/logs": "Log Screen",
  "/settings": "Settings",
};

const AppShell = () => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = titleMap[pathname] ?? "Project";

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 shrink-0 border-r border-border/70 bg-surface/60 backdrop-blur-xl flex flex-col">
        <div className="px-5 py-5 border-b border-border/70">
          <AppLogo size="md" />
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border/70 space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-2">
              {user.picture && (
                <img src={user.picture} alt={user.name || user.email} className="h-8 w-8 rounded-full" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={logout}>
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border/70 bg-background/80 backdrop-blur-xl flex items-center px-6 sticky top-0 z-10">
          <h1 className="text-base font-semibold">{title}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppShell;
