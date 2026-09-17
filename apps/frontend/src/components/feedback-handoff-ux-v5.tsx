"use client";

import Link from "next/link";
import { ACCEPTED_ONLY_HANDOFF_COPY } from "../lib/ai-review.workspace";

export function FeedbackHandoffSummaryV2({
  acceptedCount,
  rejectedCount,
  deferredCount,
  pendingCount,
  acceptedPreview,
  nextHref,
  nextLabel,
}: {
  acceptedCount: number;
  rejectedCount: number;
  deferredCount: number;
  pendingCount: number;
  acceptedPreview: Array<{ action: string; evidence: string; category?: string }>;
  nextHref?: string;
  nextLabel?: string;
}) {
  return (
    <section className="max-w-3xl space-y-3 bg-[var(--acf-surface-muted)] text-sm" data-acf-feedback-handoff-summary-v2>
      <h2 className="acf-section-title">反馈回流</h2>
      <p>
        <span className="acf-status-success">已采纳 {acceptedCount}</span>
        {" · "}
        <span className="acf-status-muted">不采纳 {rejectedCount}</span>
        {" · "}
        <span className="acf-status-warning">稍后再看 {deferredCount}</span>
        {" · "}
        <span className="text-[var(--acf-text-muted)]">未审核 {pendingCount}</span>
      </p>
      <p className="acf-caption rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand-soft)] px-2 py-1">{ACCEPTED_ONLY_HANDOFF_COPY}</p>
      <p className="acf-caption">不会自动修改计划，生成前仍由你确认。</p>
      {acceptedPreview.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium">已采纳建议：</p>
          <ul className="space-y-2">
            {acceptedPreview.map((item) => (
              <li key={item.action}>{item.action}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="acf-caption">还没有已采纳建议。</p>
      )}
      {nextHref ? (
        <Link
          className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
          href={nextHref}
        >
          {nextLabel || "开始下一轮内容规划"}
        </Link>
      ) : null}
    </section>
  );
}

export function FeedbackHandoffUXV5({
  acceptedCount,
  rejectedCount,
  deferredCount,
  acceptedPreview,
  alwaysShow = false,
  pendingCount,
  nextHref,
  nextLabel,
}: {
  acceptedCount: number;
  rejectedCount: number;
  deferredCount: number;
  acceptedPreview: Array<{ action: string; evidence: string; category?: string }>;
  alwaysShow?: boolean;
  pendingCount?: number;
  nextHref?: string;
  nextLabel?: string;
}) {
  const total = acceptedCount + rejectedCount + deferredCount + (pendingCount ?? 0);
  if (!alwaysShow && total === 0 && acceptedPreview.length === 0) return null;
  return (
    <div data-acf-feedback-handoff-v5>
      <FeedbackHandoffSummaryV2
        acceptedCount={acceptedCount}
        rejectedCount={rejectedCount}
        deferredCount={deferredCount}
        pendingCount={pendingCount ?? 0}
        acceptedPreview={acceptedPreview}
        nextHref={nextHref}
        nextLabel={nextLabel}
      />
    </div>
  );
}
