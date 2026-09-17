import Link from "next/link";
import { resolveWorkflowBackNav, type WorkflowBackNavInput } from "../lib/ux/workflow-back-nav";

export function WorkflowBackNavV1({
  page,
  projectId,
  publicationId,
  label,
  href,
  previousStepLabel,
}: Partial<WorkflowBackNavInput> & {
  page: WorkflowBackNavInput["page"];
  label?: string;
  href?: string;
  previousStepLabel?: string;
}) {
  const resolved = resolveWorkflowBackNav({ page, projectId, publicationId });
  const navLabel = label ?? resolved.label;
  const navHref = href ?? resolved.href;
  const stepLabel = previousStepLabel ?? resolved.previousStepLabel;
  return (
    <nav className="mb-3 text-sm" data-acf-workflow-back-nav-v1 aria-label="返回上一步">
      <Link className="text-neutral-800 underline-offset-2 hover:underline" href={navHref}>
        ← {navLabel.startsWith("返回") ? navLabel : `返回${navLabel}`}
      </Link>
      {stepLabel ? <p className="mt-1 text-xs text-neutral-500">上一步：{stepLabel}</p> : null}
    </nav>
  );
}
