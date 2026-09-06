"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { isProjectNavActive, PROJECT_NAV } from "../lib/project-nav";
import { useProjectWorkspace } from "../lib/project-workspace-context";
import { EditProjectPanel } from "./edit-project-panel";

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { project, setProject } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const meta = [project.industry, project.platform].filter(Boolean).join(" · ");

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-xs text-neutral-500 hover:underline" href="/dashboard/projects">
            返回项目
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {[meta, project.description].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setEditing(true)}>
            编辑项目
          </button>
          <button className="rounded-md border px-3 py-1.5 text-sm lg:hidden" type="button" onClick={() => setOpen((value) => !value)}>
            {open ? "收起导航" : "项目导航"}
          </button>
        </div>
      </div>
      {editing && accessToken ? (
        <EditProjectPanel
          project={project}
          accessToken={accessToken}
          onSaved={setProject}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className={`w-full shrink-0 lg:w-56 ${open ? "block" : "hidden lg:block"}`}>
          <nav className="rounded-xl border border-neutral-200 bg-white p-3" aria-label="项目导航">
            {PROJECT_NAV.map((group) => {
              if ("href" in group) {
                const href = group.href(project.id);
                const active = isProjectNavActive(pathname, href, group.exact);
                return (
                  <Link
                    key={group.id}
                    href={href}
                    className={`mb-1 block rounded-md px-2 py-1.5 text-sm ${active ? "bg-neutral-100 font-medium" : "text-neutral-700 hover:bg-neutral-50"}`}
                    onClick={() => setOpen(false)}
                  >
                    {group.label}
                  </Link>
                );
              }
              return (
                <div key={group.id} className="mt-3 first:mt-0">
                  <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">{group.label}</p>
                  {group.items.map((item) => {
                    const href = item.href(project.id);
                    const active = isProjectNavActive(pathname, href);
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        className={`block rounded-md px-2 py-1.5 text-sm ${active ? "bg-neutral-100 font-medium" : "text-neutral-700 hover:bg-neutral-50"}`}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
