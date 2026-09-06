"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, type AuthSession } from "./api";
import {
  applyAuthSession,
  getAuthSnapshot,
  getServerAuthSnapshot,
  hydrateAuthSession,
  logoutSession,
  subscribeAuthSession,
} from "./auth-session";

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
  const snapshot = useSyncExternalStore(subscribeAuthSession, getAuthSnapshot, getServerAuthSnapshot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hydrateAuthSession().then(() => {
      if (cancelled) {
        return;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session: snapshot.session,
      accessToken: snapshot.accessToken,
      ready: snapshot.ready,
      error: error ?? snapshot.error,
      async register(input) {
        setError(null);
        const data = await api<AuthSession>("/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
          skipAuthRecovery: true,
        });
        applyAuthSession(data);
      },
      async login(input) {
        setError(null);
        const data = await api<AuthSession>("/auth/login", {
          method: "POST",
          body: JSON.stringify(input),
          skipAuthRecovery: true,
        });
        applyAuthSession(data);
      },
      async logout() {
        await logoutSession();
      },
    }),
    [error, snapshot.accessToken, snapshot.error, snapshot.ready, snapshot.session],
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
