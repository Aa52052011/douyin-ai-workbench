"use client";

import { useState } from "react";
import { RecommendationCardV2 } from "./recommendation-card-v2";
import { remainingCount, visibleByPersistedOrder } from "../lib/ai-review.workspace";

export type RecommendationReviewItem = {
  id: string;
  title: string;
  reason: string;
  evidence: string;
  evidenceLines?: string[];
  observation?: string;
  interpretation?: string;
  recommendedAction?: string;
  uncertainty?: string;
  confidence?: string;
  causality?: string;
  type?: string;
  group?: string;
  hypothesis?: boolean;
  reviewStatus?: string;
  reviewHistory?: Array<{ decision?: string; reviewedAt?: string; reviewedBy?: string | null }>;
  reviewedAt?: string | null;
  insufficient?: boolean;
};

export function RecommendationReviewV5({
  items,
  decisions: _decisions,
  singlePost,
  pendingId,
  errorId,
  errorMessage,
  onDecide,
}: {
  items: RecommendationReviewItem[];
  decisions: Record<string, "approve" | "reject" | "defer">;
  singlePost: boolean;
  pendingId?: string | null;
  errorId?: string | null;
  errorMessage?: string | null;
  onDecide: (id: string, action: "approve" | "reject" | "defer") => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;
  const visible = visibleByPersistedOrder(items, showAll, 3);
  const extra = remainingCount(items.length, 3);
  return (
    <section className="space-y-4" data-acf-recommendation-review-v5>
      <p className="sr-only">采纳 不采纳 稍后再看 待验证假设 正在保存决策 保存决策失败，请重试</p>
      {visible.map((item) => (
        <RecommendationCardV2
          key={item.id}
          item={item}
          singlePost={singlePost}
          pending={pendingId === item.id}
          errorMessage={errorId === item.id ? errorMessage : null}
          onDecide={onDecide}
        />
      ))}
      {extra > 0 && !showAll ? (
        <button className="text-sm underline" type="button" aria-expanded={false} onClick={() => setShowAll(true)}>
          查看另外 {extra} 条建议
        </button>
      ) : null}
      {showAll && extra > 0 ? (
        <button className="text-sm underline" type="button" aria-expanded={true} onClick={() => setShowAll(false)}>
          收起其余建议
        </button>
      ) : null}
    </section>
  );
}
