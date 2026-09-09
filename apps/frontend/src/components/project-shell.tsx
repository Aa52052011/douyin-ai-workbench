"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { isProjectNavActive, PROJECT_NAV } from "../lib/project-nav";
import { projectPlatformLabel } from "../lib/project-platform";
import { useProjectWorkspace } from "../lib/project-workspace-context";
import { EditProjectPanel } from "./edit-project-panel";

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { project, setProject } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const platformLabel = projectPlatformLabel(project.platform);
  const meta = [project.industry ? `行业：${project.industry}` : null, `目标平台：${platformLabel}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="px-3 py-4 md:px-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
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
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
        <aside className={`w-full shrink-0 lg:w-52 ${open ? "block" : "hidden lg:block"}`}>
          <nav className="rounded-xl border border-neutral-200 bg-white p-2.5" aria-label="项目导航">
            {PROJECT_NAV.map((group) => {
              if ("href" in group) {
                const href = group.href(project.id);
                const active = isProjectNavActive(pathname, href, group.exact);
                return (
                  <Link
                    key={group.id}
                    href={href}
                    className={`mb-0.5 block rounded-md px-2 py-1.5 text-sm ${active ? "bg-neutral-100 font-medium" : "text-neutral-700 hover:bg-neutral-50"}`}
                    onClick={() => setOpen(false)}
                  >
                    {group.label}
                  </Link>
                );
              }
              return (
                <div key={group.id} className="mt-2.5 first:mt-0">
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
