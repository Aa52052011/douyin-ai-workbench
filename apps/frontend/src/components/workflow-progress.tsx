import Link from "next/link";
import { WORKFLOW_STAGE_STATUS_LABEL, type WorkflowStageStateV2 } from "../lib/ux/workflow-stages";
import { ProductStatusBadge } from "./ui/badge";
import { cn } from "../lib/ux/cn";

export function WorkflowProgress({ stages }: { stages: WorkflowStageStateV2[] }) {
  return (
    <ol className="flex flex-wrap gap-2" data-acf-workflow-progress>
      {stages.map((stage) => (
        <li key={stage.id}>
          <Link
            href={stage.href}
            aria-current={stage.current ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--acf-radius-sm)] border px-2 py-1 text-xs",
              stage.current
                ? "border-[var(--acf-brand)] bg-[var(--acf-brand-subtle)]"
                : "border-[var(--acf-border)] bg-[var(--acf-surface)]",
            )}
          >
            <span>{stage.label}</span>
            <ProductStatusBadge status={stage.status} />
            <span className="sr-only">{WORKFLOW_STAGE_STATUS_LABEL[stage.status]}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
