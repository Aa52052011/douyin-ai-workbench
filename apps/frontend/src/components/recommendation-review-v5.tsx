"use client";

import { Button } from "./ui/button";
import {
  CONFIDENCE_TOOLTIP,
  POSITIONING_SINGLE_POST_DOWNGRADE,
  applyFeedbackCopy,
  causalityCopy,
  confidenceCopy,
  findingTypeCopy,
  recommendationGroupLabel,
} from "../lib/ux/publication-monitoring-v5";

export type RecommendationReviewItem = {
  id: string;
  title: string;
  reason: string;
  evidence: string;
  confidence?: string;
  causality?: string;
  type?: string;
  group?: string;
  hypothesis?: boolean;
};

export function RecommendationReviewV5({
  items,
  decisions,
  singlePost,
  onDecide,
}: {
  items: RecommendationReviewItem[];
  decisions: Record<string, "approve" | "reject" | "defer">;
  singlePost: boolean;
  onDecide: (id: string, action: "approve" | "reject" | "defer") => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4" data-acf-recommendation-review-v5>
      <p className="text-sm">你正在审核：AI给出的优化建议</p>
      {items.map((item) => (
        <article key={item.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-xs text-neutral-500">{recommendationGroupLabel(item.group)}</p>
          {item.hypothesis || item.type === "HYPOTHESIS" ? (
            <p className="text-xs font-medium">待验证假设</p>
          ) : (
            <p className="text-xs text-neutral-500">{findingTypeCopy(item.type)}</p>
          )}
          <p className="font-medium">建议：{item.title}</p>
          <p>原因：{item.reason}</p>
          <p>依据：{item.evidence}</p>
          {confidenceCopy(item.confidence) ? (
            <p title={CONFIDENCE_TOOLTIP}>
              置信度：{confidenceCopy(item.confidence)}
              <span className="ml-1 text-neutral-500">（{CONFIDENCE_TOOLTIP}）</span>
            </p>
          ) : null}
          {causalityCopy(item.causality) ? <p>{causalityCopy(item.causality)}</p> : null}
          {singlePost && recommendationGroupLabel(item.group) === "账号定位" ? (
            <p className="text-neutral-600">{POSITIONING_SINGLE_POST_DOWNGRADE}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={() => onDecide(item.id, "approve")}>
              采纳
            </Button>
            <Button type="button" variant="secondary" onClick={() => onDecide(item.id, "reject")}>
              不采纳
            </Button>
            <Button type="button" variant="ghost" onClick={() => onDecide(item.id, "defer")}>
              稍后再看
            </Button>
          </div>
          {decisions[item.id] === "approve" ? <p className="text-neutral-600">{applyFeedbackCopy()}</p> : null}
        </article>
      ))}
    </section>
  );
}
