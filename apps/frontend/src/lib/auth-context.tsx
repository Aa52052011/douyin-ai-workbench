"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type AuthSession } from "./api";

type AuthState = {
  session: Omit<AuthSession, "accessToken" | "expiresIn"> | null;
  accessToken: string | null;
  ready: boolean;
  error: string | null;
  register: (input: { email: string; password: string; name: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthState["session"]>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applySession(data: AuthSession) {
    setAccessToken(data.accessToken ?? null);
    setSession({
      user: data.user,
      tenant: data.tenant,
      workspace: data.workspace,
      role: data.role,
    });
  }

  async function hydrate() {
    try {
      const refreshed = await api<AuthSession>("/auth/refresh", { method: "POST", body: "{}" });
      applySession(refreshed);
    } catch {
      setAccessToken(null);
      setSession(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void hydrate();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      accessToken,
      ready,
      error,
      async register(input) {
        setError(null);
        const data = await api<AuthSession>("/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
        });
        applySession(data);
      },
      async login(input) {
        setError(null);
        const data = await api<AuthSession>("/auth/login", {
          method: "POST",
          body: JSON.stringify(input),
        });
        applySession(data);
      },
      async logout() {
        await api("/auth/logout", { method: "POST", body: "{}" });
        setAccessToken(null);
        setSession(null);
      },
    }),
    [accessToken, error, ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
