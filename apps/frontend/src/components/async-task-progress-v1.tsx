"use client";

import { Button } from "./ui/button";

export function AsyncTaskProgressV1({
  status,
  label,
  stages = [],
  canLeave,
  error,
  onRetry,
}: {
  status?: string;
  label: string;
  stages?: Array<{ id: string; label: string; state: "done" | "current" | "todo" }>;
  progress?: number;
  canLeave?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-4 py-3" aria-live="polite" data-acf-async-task-progress>
      <p className="acf-card-title">{label}</p>
      {stages.length ? (
        <ul className="mt-2 space-y-1 text-sm text-[var(--acf-text-secondary)]">
          {stages.map((stage) => (
            <li key={stage.id}>
              {stage.state === "done" ? "✓ " : stage.state === "current" ? "● " : "○ "}
              {stage.label}
            </li>
          ))}
        </ul>
      ) : null}
      {canLeave ? <p className="acf-caption mt-2">你可以离开此页面，任务会继续执行。</p> : null}
      {error ? (
        <div className="mt-2">
          <p className="text-sm text-[var(--acf-danger)]">{error}</p>
          {onRetry ? (
            <Button className="mt-2" size="sm" type="button" variant="secondary" onClick={onRetry}>
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      {status ? <span className="sr-only">{status}</span> : null}
    </div>
  );
}
