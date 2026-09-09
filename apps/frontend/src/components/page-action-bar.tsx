import type { ReactNode } from "react";

/**
 * Sticky / stable primary action region for WORKSPACE pages.
 * Desktop: bar at bottom of workspace, actions end-aligned.
 * Mobile: sticky bottom with safe padding so content isn't covered.
 */
export function PageActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  if (!children) {
    return null;
  }
  return (
    <div
      className={
        className ??
        "sticky bottom-0 z-10 -mx-1 mt-auto border-t border-neutral-200 bg-neutral-50/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-neutral-50/80 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
      }
      data-acf-action-bar="true"
    >
      <div className="flex flex-col gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:flex-row lg:items-center lg:justify-end lg:gap-3 lg:pb-0">
        {children}
      </div>
    </div>
  );
}
