"use client";

import { Button } from "./button";

export function HumanReviewBar({
  context,
  onConfirm,
  onRequestChanges,
  onDefer,
  onReject,
  confirmLabel,
  requestChangesLabel,
  deferLabel,
}: {
  context: string;
  onConfirm: () => void;
  onRequestChanges: () => void;
  onDefer?: () => void;
  onReject?: () => void;
  confirmLabel?: string;
  requestChangesLabel?: string;
  deferLabel?: string;
}) {
  return (
    <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <p className="text-sm">你正在确认：{context}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onConfirm}>{confirmLabel ?? "确认通过"}</Button>
        <Button variant="secondary" onClick={onRequestChanges}>
          {requestChangesLabel ?? "需要修改"}
        </Button>
        {onDefer ? (
          <Button variant="ghost" onClick={onDefer}>
            {deferLabel ?? "暂不处理"}
          </Button>
        ) : null}
        {onReject ? (
          <Button variant="danger" onClick={onReject}>
            拒绝
          </Button>
        ) : null}
      </div>
    </div>
  );
}
