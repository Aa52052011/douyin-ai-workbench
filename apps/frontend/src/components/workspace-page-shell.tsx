import type { ReactNode } from "react";
import { PageActionBar } from "./page-action-bar";

/**
 * WORKSPACE page foundation: viewport-bounded height, single primary scroll region, stable actions.
 * READING/DETAIL pages should NOT use this shell.
 */
export function WorkspacePageShell({
  header,
  children,
  sidebar,
  actions,
  className,
}: {
  header?: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const hasSidebar = Boolean(sidebar);

  return (
    <div
      className={
        className ??
        "flex min-h-0 flex-col gap-3 [--acf-workspace-h:calc(100dvh-12.5rem)] lg:[--acf-workspace-h:calc(100dvh-11rem)]"
      }
      data-acf-page-type="workspace"
      data-acf-workspace="true"
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div
        className={
          hasSidebar
            ? "grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,16rem)]"
            : "flex min-h-0 flex-1 flex-col"
        }
        style={{ maxHeight: "var(--acf-workspace-h)", height: "var(--acf-workspace-h)" }}
      >
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50/40">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-acf-workspace-scroll="main">
            {children}
          </div>
          {actions ? (
            <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-3">
              <PageActionBar className="static border-0 bg-transparent p-0 backdrop-blur-none">
                {actions}
              </PageActionBar>
            </div>
          ) : null}
        </div>
        {hasSidebar ? (
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden" data-acf-workspace-sidebar="true">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-16 lg:pb-0" data-acf-workspace-scroll="sidebar">
              {sidebar}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
