"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../lib/auth-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, ready, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) {
      router.replace("/login");
    }
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>加载中…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/dashboard" className="font-semibold">
          AI Content Factory
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {session.user.name} · {session.user.email}
          </span>
          <button className="underline" onClick={() => void logout().then(() => router.push("/login"))}>
            退出
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
