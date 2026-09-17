"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import type { RecommendationReviewItem } from "./recommendation-review-v5";
import {
  CONFIDENCE_GRASP_HINT,
  MISSING_EVIDENCE_COPY,
  NO_CAUSAL_COPY,
  confidenceGraspLabel,
  evidenceLineForCard,
  reviewStatusUserLabel,
} from "../lib/ai-review.workspace";
import { POSITIONING_SINGLE_POST_DOWNGRADE, causalityCopy, recommendationGroupLabel } from "../lib/ux/publication-monitoring-v5";
import { REVIEW_SAVE_FAILED } from "../lib/performance-review.view";

export function RecommendationCardV2({
  item,
  singlePost,
  pending,
  errorMessage,
  onDecide,
}: {
  item: RecommendationReviewItem;
  singlePost: boolean;
  pending?: boolean;
  errorMessage?: string | null;
  onDecide: (id: string, action: "approve" | "reject" | "defer") => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [lastAction, setLastAction] = useState<"approve" | "reject" | "defer" | null>(null);
  const status = item.reviewStatus;
  const reviewed = status === "ACCEPTED" || status === "APPROVED" || status === "REJECTED" || status === "DEFERRED";
  const evidence = evidenceLineForCard(item);
  const grasp = confidenceGraspLabel(item.confidence);
  const showActions = !reviewed || changing;

  function decide(action: "approve" | "reject" | "defer") {
    setLastAction(action);
    setChanging(false);
    onDecide(item.id, action);
  }

  return (
    <article
      className={`max-w-3xl space-y-3 rounded-[var(--acf-radius-md)] border p-4 ${
        item.insufficient ? "border-[var(--acf-border)] bg-[var(--acf-surface-muted)]" : "border-[var(--acf-border)] bg-[var(--acf-surface)]"
      }`}
      data-acf-recommendation-card-v2
    >
      {item.hypothesis || item.type === "HYPOTHESIS" ? <p className="text-xs font-medium">待验证假设</p> : null}
      <h3 className="text-base font-medium">{item.title}</h3>
      <p>
        <span className="acf-caption mr-2">建议</span>
        {item.recommendedAction || item.title}
      </p>
      <p className="text-sm">
        <span className="acf-caption mr-2">依据</span>
        {evidence || MISSING_EVIDENCE_COPY}
      </p>
      {grasp ? (
        <p className="acf-caption" title={CONFIDENCE_GRASP_HINT}>
          判断把握：{grasp}
        </p>
      ) : null}
      {singlePost && recommendationGroupLabel(item.group) === "账号定位" ? (
        <p className="acf-caption">{POSITIONING_SINGLE_POST_DOWNGRADE}</p>
      ) : null}
      {!reviewed ? (
        <p className="font-medium" data-acf-review-status>
          状态：{reviewStatusUserLabel(status)}
        </p>
      ) : null}
      {pending ? (
        <p className="acf-caption" aria-live="polite">
          正在保存决策...
        </p>
      ) : null}
      {reviewed && !changing ? (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <p
            className={`text-sm font-medium ${
              status === "ACCEPTED" || status === "APPROVED"
                ? "acf-status-success"
                : status === "REJECTED"
                  ? "acf-status-muted"
                  : "acf-status-warning"
            }`}
          >
            {status === "ACCEPTED" || status === "APPROVED" ? "✓ 已采纳" : status === "REJECTED" ? "不采纳" : "稍后再看"}
          </p>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setChanging(true)}>
            更改决定
          </Button>
        </div>
      ) : null}
      {showActions ? (
        <div className="flex flex-wrap gap-2 pt-1" aria-label="你的决定">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => decide("approve")}>
            采纳
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => decide("reject")}>
            不采纳
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => decide("defer")}>
            稍后再看
          </Button>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="text-sm text-[var(--acf-danger)]" role="alert">
          <p>{errorMessage || REVIEW_SAVE_FAILED || "保存决策失败，请重试"}</p>
          <p>保存失败，请重试。</p>
          {lastAction ? (
            <Button className="mt-2" size="sm" type="button" variant="secondary" onClick={() => decide(lastAction)}>
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer">查看分析依据</summary>
        <div className="mt-2 space-y-1">
          {item.interpretation || item.reason ? (
            <p className="acf-body">
              <span className="acf-caption mr-2">为什么</span>
              {item.interpretation || item.reason}
            </p>
          ) : null}
          <p className="acf-caption">不确定性：{item.uncertainty || NO_CAUSAL_COPY}</p>
          {causalityCopy(item.causality) ? <p className="acf-caption">{causalityCopy(item.causality)}</p> : null}
        </div>
      </details>
      {item.reviewHistory && item.reviewHistory.length > 0 ? (
        <div>
          <button className="acf-caption underline" type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}>
            {historyOpen ? "收起决策记录" : "查看决策记录"}
          </button>
          {historyOpen ? (
            <ul className="mt-2 space-y-1 acf-caption">
              {item.reviewHistory.map((row, index) => (
                <li key={`${row.reviewedAt}-${index}`}>
                  {row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : "时间未填写"}
                  {row.decision ? ` · ${reviewStatusUserLabel(row.decision)}` : ""}
                  {row.reviewedBy ? " · 你" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
