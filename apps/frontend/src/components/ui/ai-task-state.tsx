"use client";

import { AI_TASK_COPY, type AITaskStateV1 } from "../../lib/ux/ai-task";

export function AITaskState({
  state,
  stages,
}: {
  state: AITaskStateV1;
  stages?: string[];
}) {
  const copy = AI_TASK_COPY[state];
  return (
    <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-4 py-3" aria-live="polite">
      <p className="text-sm font-medium">{copy.stage}</p>
      {stages?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--acf-text-secondary)]">
          {stages.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <p className="acf-caption mt-2">{copy.canLeave}</p>
      <p className="acf-caption">{copy.next}</p>
    </div>
  );
}
