"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { GLOBAL_NAV } from "../lib/global-nav";
import { useAuth } from "../lib/auth-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-4 px-3 py-3 md:px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
              AI Content Factory
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
              {GLOBAL_NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-neutral-100 font-medium" : "text-neutral-600 hover:bg-neutral-50"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-neutral-600 sm:inline">{session?.user.name}</span>
            <button
              className="underline"
              onClick={() => void logout().then(() => router.push("/login"))}
              type="button"
            >
              退出
            </button>
            <button className="rounded-md border px-2 py-1 md:hidden" type="button" onClick={() => setOpen((value) => !value)}>
              菜单
            </button>
          </div>
        </div>
        {open ? (
          <nav className="border-t border-neutral-200 px-4 py-2 md:hidden" aria-label="移动主导航">
            {GLOBAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-2 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <div className="mx-auto max-w-[100rem]">{children}</div>
    </div>
  );
}
