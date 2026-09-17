"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "../../components/app-shell";
import { useAuth } from "../../lib/auth-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) {
      router.replace("/login");
    }
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--acf-page)]">
        <p className="text-sm text-[var(--acf-text-secondary)]">加载中…</p>
      </main>
    );
  }

  return <AppShell>{children}</AppShell>;
}
