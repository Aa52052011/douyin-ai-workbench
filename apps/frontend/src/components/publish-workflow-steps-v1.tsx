import { PUBLISH_WORKFLOW_STEPS } from "../lib/publish.workspace";

export function PublishWorkflowStepsV1({ currentIndex }: { currentIndex: number }) {
  return (
    <ol className="mb-4 grid grid-cols-1 gap-1 xl:grid-cols-5" data-acf-publish-workflow-steps-v1>
      {PUBLISH_WORKFLOW_STEPS.map((label, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        return (
          <li
            key={label}
            className={`px-1 py-1 text-sm ${
              state === "current" ? "font-medium text-[var(--acf-text)]" : "text-[var(--acf-text-secondary)]"
            }`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="mr-1 text-xs">{index + 1}.</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
