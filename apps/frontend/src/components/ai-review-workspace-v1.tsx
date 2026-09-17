"use client";

import { useState } from "react";
import { EmptyState } from "./empty-state";
import { InlineActionErrorV1 } from "./inline-action-error-v1";
import { ObservationCardV2 } from "./observation-card-v2";
import { FeedbackHandoffUXV5 } from "./feedback-handoff-ux-v5";
import { RecommendationReviewV5, type RecommendationReviewItem } from "./recommendation-review-v5";
import {
  ANALYSIS_GENERATION_FAILED,
  ANALYSIS_LOAD_FAILED,
  EMPTY_ANALYSIS_BODY,
  EMPTY_ANALYSIS_TITLE,
  observationCardsFromRecommendations,
  remainingCount,
  reviewCountsFromItems,
  visibleByPersistedOrder,
} from "../lib/ai-review.workspace";
import { insufficientReviewCopy } from "../lib/ux/publication-monitoring-v5";

export function AiReviewWorkspaceV1({
  hasMetrics,
  hasAnalysis,
  recs,
  decisions,
  singlePost,
  pendingReviewId,
  reviewCardError,
  analysisLoadError,
  analysisGenerationError,
  onDecide,
  nextHref,
  nextLabel,
}: {
  hasMetrics: boolean;
  hasAnalysis: boolean;
  recs: RecommendationReviewItem[];
  decisions: Record<string, "approve" | "reject" | "defer">;
  singlePost: boolean;
  pendingReviewId?: string | null;
  reviewCardError?: { id: string; message: string } | null;
  analysisLoadError?: string | null;
  analysisGenerationError?: string | null;
  onDecide: (id: string, action: "approve" | "reject" | "defer") => void;
  nextHref?: string;
  nextLabel?: string;
}) {
  const [showAllObservations, setShowAllObservations] = useState(false);
  const observations = observationCardsFromRecommendations(recs);
  const visibleObservations = visibleByPersistedOrder(observations, showAllObservations, 3);
  const extraObservations = remainingCount(observations.length, 3);
  const counts = reviewCountsFromItems(recs);

  if (!hasMetrics) {
    return <p className="text-sm">{insufficientReviewCopy()}</p>;
  }

  if (analysisLoadError && recs.length === 0) {
    return <InlineActionErrorV1 message={`${ANALYSIS_LOAD_FAILED}。${analysisLoadError}`} />;
  }

  if (!hasAnalysis && recs.length === 0) {
    return (
      <div className="space-y-3">
        {analysisGenerationError ? (
          <InlineActionErrorV1 message={analysisGenerationError.includes("分析生成失败") ? analysisGenerationError : `${ANALYSIS_GENERATION_FAILED} ${analysisGenerationError}`} />
        ) : (
          <EmptyState title={EMPTY_ANALYSIS_TITLE} description={EMPTY_ANALYSIS_BODY} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-acf-ai-review-workspace-v1>
      <section className="space-y-3">
        <h2 className="acf-section-title">观察</h2>
        {visibleObservations.map((item) => (
          <ObservationCardV2 key={item.id} item={item} />
        ))}
        {extraObservations > 0 && !showAllObservations ? (
          <button className="text-sm underline" type="button" aria-expanded={false} onClick={() => setShowAllObservations(true)}>
            查看另外 {extraObservations} 条观察
          </button>
        ) : null}
      </section>
      <section className="space-y-3 max-xl:flex-col">
        <h2 className="acf-section-title">建议</h2>
        <RecommendationReviewV5
          items={recs}
          decisions={decisions}
          singlePost={singlePost}
          pendingId={pendingReviewId}
          errorId={reviewCardError?.id}
          errorMessage={reviewCardError?.message}
          onDecide={onDecide}
        />
      </section>
      <FeedbackHandoffUXV5
        acceptedCount={counts.accepted}
        rejectedCount={counts.rejected}
        deferredCount={counts.deferred}
        pendingCount={counts.pending}
        acceptedPreview={recs
          .filter((item) => item.reviewStatus === "ACCEPTED" || item.reviewStatus === "APPROVED")
          .map((item) => ({ action: item.recommendedAction || item.title, evidence: item.evidence, category: item.group }))}
        alwaysShow
        nextHref={nextHref}
        nextLabel={nextLabel}
      />
    </div>
  );
}
