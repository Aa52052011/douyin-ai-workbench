"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "./ui/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void import("../lib/ui-interaction-diagnostics").then((mod) => {
      mod.installAcfUiDiag();
    });
  }, []);
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
