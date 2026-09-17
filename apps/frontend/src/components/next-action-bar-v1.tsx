import Link from "next/link";
import { WorkflowBackNavV1 } from "./workflow-back-nav-v1";

export function NextActionBarV1({
  backHref,
  backLabel,
  currentLabel,
  nextHref,
  nextLabel,
}: {
  backHref?: string;
  backLabel?: string;
  currentLabel?: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  if (!backHref && !nextHref && !currentLabel) return null;
  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--acf-border-subtle)] pt-4 text-sm"
      data-acf-next-action-bar-v1
      aria-label="流程方向"
    >
      {backHref ? (
        <Link className="inline-flex min-h-9 items-center text-[var(--acf-text)] underline-offset-2 hover:underline" href={backHref}>
          ← {backLabel ?? "上一步"}
        </Link>
      ) : (
        <span />
      )}
      {currentLabel ? <p className="acf-caption">当前：{currentLabel}</p> : <span />}
      {nextHref ? (
        <Link className="min-h-9 text-[var(--acf-brand)] underline-offset-2 hover:underline" href={nextHref}>
          下一阶段：{nextLabel ?? "下一步"} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export { WorkflowBackNavV1 };
