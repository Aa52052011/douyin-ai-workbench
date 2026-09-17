"use client";

import { CONTENT_WORKFLOW_OVERVIEW } from "../lib/ux/onboarding-v1";
import { Dialog } from "./ui/dialog";

export function WorkflowOverviewDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Dialog open title="你的内容工作流" description="每一步只做一件事，可以随时跳过说明。" onClose={onClose}>
      <ol className="space-y-3" data-acf-workflow-overview>
        {CONTENT_WORKFLOW_OVERVIEW.map((item, index) => (
          <li key={item.title} className="text-sm">
            <p className="font-medium">
              {index + 1}. {item.title}
              {index < CONTENT_WORKFLOW_OVERVIEW.length - 1 ? " →" : ""}
            </p>
            <p className="acf-body-secondary mt-1">{item.body}</p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
