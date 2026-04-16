import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { googleLogout } from "@react-oauth/google";

interface User {
  email: string;
  name: string;
  picture: string;
  idToken: string;
  expiresAt: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  handleGoogleSuccess: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "gws_user";
const API_BASE = import.meta.env.VITE_API_URL || "";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: User = JSON.parse(stored);
        if (parsed.expiresAt > Date.now()) {
          setUser(parsed);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const handleGoogleSuccess = useCallback(async (idToken: string) => {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: idToken }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || "Access denied");
    }

    const data = await res.json();

    const newUser: User = {
      email: data.email,
      name: data.name || "",
      picture: data.picture || "",
      idToken,                          // store the raw Google ID token
      expiresAt: Date.now() + 59 * 60 * 1000,  // 59 min buffer
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    googleLogout();
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, handleGoogleSuccess, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};