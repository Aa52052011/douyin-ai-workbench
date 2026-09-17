"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { loadProjectStatus } from "../lib/load-project-status";
import {
  adjacentProjectNav,
  hideProjectShellNextActionBar,
  isProjectNavActive,
  PROJECT_FOUNDATION_NAV,
  PROJECT_MAIN_NAV,
  projectWorkflowMark,
  workflowMarkSymbol,
  type ProjectNavId,
} from "../lib/project-nav";
import { projectPlatformLabel } from "../lib/project-platform";
import { emptyStatusFacts, type ProjectStatusFacts } from "../lib/project-status";
import { useProjectWorkspace } from "../lib/project-workspace-context";
import { EditProjectPanel } from "./edit-project-panel";
import { NextActionBarV1 } from "./next-action-bar-v1";
import { workflowCurrentLabel, resolveWorkflowStagesV2 } from "../lib/ux/workflow-stages";

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { project, setProject } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [foundationOpen, setFoundationOpen] = useState(false);
  const [facts, setFacts] = useState<ProjectStatusFacts | null>(null);
  const platformLabel = projectPlatformLabel(project.platform);
  const industry = project.industry?.trim() || null;
  const stages = facts ? resolveWorkflowStagesV2(project.id, facts) : [];
  const stageLabel = stages.length ? workflowCurrentLabel(stages) : null;
  const flow = adjacentProjectNav(pathname, project.id);
  const hideShellNextBar = hideProjectShellNextActionBar(pathname, project.id);

  useEffect(() => {
    if (!accessToken || !project.id || project.createdAt === "1970-01-01T00:00:00.000Z") {
      setFacts(null);
      return;
    }
    let cancelled = false;
    void loadProjectStatus(accessToken, project.id)
      .then((snapshot) => {
        if (!cancelled) setFacts(snapshot.facts);
      })
      .catch(() => {
        if (!cancelled) setFacts(emptyStatusFacts());
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, project.id, project.createdAt]);

  return (
    <div className="px-3 py-4 md:px-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3" data-acf-project-compact-header-v1>
        <div className="min-w-0">
          <p className="acf-context-label truncate">{project.name || "加载中…"}</p>
          <p className="acf-caption mt-1">
            {[platformLabel, industry].filter(Boolean).join(" · ")}
          </p>
          {stageLabel ? <p className="mt-1 text-sm text-[var(--acf-text-secondary)]">当前：{stageLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border px-3 text-sm" type="button" onClick={() => setEditing(true)}>
            编辑项目
          </button>
          <button
            className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border px-3 text-sm lg:hidden"
            type="button"
            aria-expanded={open}
            aria-controls="acf-project-nav"
            onClick={() => setOpen((value) => !value)}
          >
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
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <aside id="acf-project-nav" className={`w-full shrink-0 lg:w-52 ${open ? "block" : "hidden lg:block"}`}>
          <nav className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-2.5" aria-label="项目流程" data-acf-project-workflow-nav-v2>
            {PROJECT_MAIN_NAV.map((item) => {
              const href = item.href(project.id);
              const active = isProjectNavActive(pathname, href, "exact" in item ? item.exact : false);
              const mark = projectWorkflowMark(item.id as ProjectNavId, active, facts);
              const itemClass = active
                ? mark === "current"
                  ? "acf-nav-current"
                  : "acf-nav-page"
                : mark === "current"
                  ? "acf-nav-workflow"
                  : mark === "done"
                    ? "acf-nav-done hover:bg-[var(--acf-surface-muted)]"
                    : "acf-nav-todo hover:bg-[var(--acf-surface-muted)]";
              return (
                <Link
                  key={item.id}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`mb-0.5 flex min-h-9 items-center gap-2 rounded-[var(--acf-radius-sm)] px-2 py-1.5 text-sm ${itemClass}`}
                  onClick={() => setOpen(false)}
                >
                  <span
                    aria-hidden
                    className={`w-4 text-center text-xs ${mark === "done" ? "text-[var(--acf-success)]" : mark === "current" ? "text-[var(--acf-brand)]" : ""}`}
                  >
                    {workflowMarkSymbol(mark)}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <details className="mt-2.5" open={foundationOpen} onToggle={(event) => setFoundationOpen((event.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-[var(--acf-text-muted)]" aria-expanded={foundationOpen}>
                项目资料
              </summary>
              {PROJECT_FOUNDATION_NAV.map((item) => {
                const href = item.href(project.id);
                const active = isProjectNavActive(pathname, href);
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className={`mt-0.5 block rounded-[var(--acf-radius-sm)] px-2 py-1.5 text-sm ${active ? "acf-nav-active" : "text-[var(--acf-text-secondary)] hover:bg-[var(--acf-surface-muted)]"}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </details>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          {children}
          {hideShellNextBar ? null : (
            <NextActionBarV1
              backHref={flow.back?.href}
              backLabel={flow.back?.label}
              currentLabel={flow.current}
              nextHref={flow.next?.href}
              nextLabel={flow.next?.label}
            />
          )}
        </main>
      </div>
    </div>
  );
}
