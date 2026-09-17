"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { GLOBAL_NAV } from "../lib/global-nav";
import { useAuth } from "../lib/auth-context";
import { PageContainerV2 } from "./page-container-v2";
import { ProjectSwitcher } from "./project-switcher";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inProjectWorkspace = /\/dashboard\/projects\/[^/]+/.test(pathname);
  const alignWithHeader = inProjectWorkspace || pathname === "/dashboard";

  return (
    <div className="min-h-screen min-w-0 bg-[var(--acf-page)] text-[var(--acf-text)]" data-acf-app-shell-v2>
      <header className="sticky top-0 z-20 border-b border-[var(--acf-border)] bg-[var(--acf-surface-elevated)]">
        <div className="acf-app-frame flex h-[var(--acf-topbar-height)] items-center justify-between gap-3 px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/dashboard" className="truncate text-sm font-semibold tracking-tight" title="抖音 AI 智能工作台">
              智能工作台
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
              {GLOBAL_NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] px-3 py-1.5 text-sm ${active ? "acf-nav-active" : "text-[var(--acf-text-secondary)] hover:bg-[var(--acf-brand-soft)]"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <ProjectSwitcher />
            <span
              className="hidden max-w-[4.5rem] truncate text-xs text-[var(--acf-text-muted)] lg:inline"
              title={session?.user.name}
            >
              {session?.user.name}
            </span>
            <button
              className="inline-flex min-h-9 items-center text-[var(--acf-text-secondary)] underline"
              onClick={() => void logout().then(() => router.push("/login"))}
              type="button"
              title={session?.user.name ? `退出（${session.user.name}）` : "退出"}
            >
              退出
            </button>
            <button
              className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border px-3 md:hidden"
              type="button"
              aria-expanded={open}
              aria-controls="acf-global-mobile-nav"
              onClick={() => setOpen((value) => !value)}
            >
              菜单
            </button>
          </div>
        </div>
        {open ? (
          <nav id="acf-global-mobile-nav" className="border-t border-[var(--acf-border)] px-4 py-2 md:hidden" aria-label="移动主导航">
            {GLOBAL_NAV.map((item) => {
              const active = item.match(pathname);
              return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="block min-h-9 rounded-[var(--acf-radius-sm)] px-2 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
              );
            })}
          </nav>
        ) : null}
      </header>
      <div className="acf-app-frame">
        {alignWithHeader ? children : <PageContainerV2>{children}</PageContainerV2>}
      </div>
    </div>
  );
}
