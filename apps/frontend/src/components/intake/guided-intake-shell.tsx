import type { ReactNode } from "react";

/**
 * Dual-pane intake workspace: conversation + draft.
 * Fills parent height; each pane scrolls internally (no page double-scroll).
 */
export function GuidedIntakeShell({
  conversation,
  draft,
}: {
  conversation: ReactNode;
  draft: ReactNode;
}) {
  return (
    <div
      className="grid min-h-0 w-full flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch"
      style={{ height: "var(--acf-workspace-h, calc(100dvh - 13rem))", maxHeight: "var(--acf-workspace-h, calc(100dvh - 13rem))" }}
      data-acf-workspace="true"
      data-acf-page-type="workspace"
    >
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" data-acf-workspace-scroll="conversation">
        {conversation}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" data-acf-workspace-scroll="draft">
        {draft}
      </div>
    </div>
  );
}
