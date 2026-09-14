"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "./ui/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
