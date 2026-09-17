import assert from "node:assert/strict";
import {
  autoStrategyEnabled,
  autoSyncEnabled,
  canSubmitMetrics,
  createManualMetricsBody,
  eligiblePerformancePublications,
  emptyMetricForm,
  mountWriteOperations,
  nextPlanHref,
  percentInputToRate,
  pretendsFullFeedback,
  resolvePerformanceQuery,
  hoursSince,
  sortSnapshotsNewestFirst,
} from "./performance.form";
import type { MetricSnapshotRecord } from "./performance.types";
import { PERFORMANCE_RAW_TERMS } from "./performance.types";
import {
  feedbackLoopCopy,
  hasCausalLanguage,
  displayMetricValue,
  humanizePerformanceInsight,
  insightObservationText,
  insufficientDataCopy,
  limitedSampleCopy,
  latestMetricCards,
  metricFieldLabel,
  metricHistoryRows,
  metricSourceLabel,
  noMetricsEmptyTitle,
  noPublishedEmptyTitle,
  optimizationPretendsFullFeedback,
  optimizationScopeNote,
  performanceReviewItems,
  viewModelHasRawContract,
} from "./performance.view";
import type { PublicationRecord } from "./publication.types";
import { evidenceForInsight, INSUFFICIENT_EVIDENCE_COPY } from "./ux/publication-monitoring-v5";
import {
  isActionableRecommendationText,
  persistedDecisionLabel,
  REVIEW_SAVE_FAILED,
  reviewItemsFromAnalysis,
} from "./performance-review.view";

function publication(partial: Partial<PublicationRecord> & Pick<PublicationRecord, "id" | "status">): PublicationRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    title: partial.title ?? "已发布作品",
    publishedAt: partial.publishedAt ?? "2026-03-02T00:00:00.000Z",
    ...partial,
  };
}

function snapshot(partial: Partial<MetricSnapshotRecord> & Pick<MetricSnapshotRecord, "observedAt">): MetricSnapshotRecord {
  return {
    views: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 3,
    ...partial,
  };
}

function run() {
  const items = [
    publication({ id: "pub-ok", status: "PUBLISHED" }),
    publication({ id: "pub-pending", status: "PENDING" }),
    publication({ id: "pub-failed", status: "FAILED" }),
    publication({ id: "pub-unknown", status: "UNKNOWN_EXTERNAL_STATE" }),
    publication({ id: "pub-no-time", status: "PUBLISHED", publishedAt: null }),
  ];

  // 1 PUBLISHED publication filtering
  assert.deepEqual(
    eligiblePerformancePublications(items).map((item) => item.id),
    ["pub-ok"],
  );
  assert.equal(
    eligiblePerformancePublications(items).some((item) => item.status !== "PUBLISHED"),
    false,
  );

  // 2 valid publicationId preselect
  const valid = resolvePerformanceQuery("pub-ok", eligiblePerformancePublications(items));
  assert.equal(valid.publicationId, "pub-ok");
  assert.equal(valid.warning, null);

  // 3 invalid query no fallback
  const invalid = resolvePerformanceQuery("pub-pending", eligiblePerformancePublications(items));
  assert.equal(invalid.publicationId, "");
  assert.notEqual(invalid.publicationId, "pub-ok");
  assert.equal(invalid.warning, "所选作品暂不可录入表现数据，请重新选择。");
  assert.equal(resolvePerformanceQuery("missing", eligiblePerformancePublications(items)).publicationId, "");

  // 4 no metrics empty state
  assert.equal(noMetricsEmptyTitle(), "还没有表现数据");
  assert.equal(noPublishedEmptyTitle(), "还没有已发布作品");

  // 5 metric field 中文
  assert.equal(metricFieldLabel("views"), "播放量");
  assert.equal(metricFieldLabel("likes"), "点赞");
  assert.equal(metricFieldLabel("comments"), "评论");
  assert.equal(metricFieldLabel("shares"), "分享");
  assert.equal(metricFieldLabel("favorites"), "收藏");
  assert.equal(metricFieldLabel("completionRate"), "完播率");
  assert.equal(metricFieldLabel("averageWatchTimeSeconds"), "平均观看时长");
  assert.equal(metricFieldLabel("newFollowers"), "新增粉丝");
  assert.equal(metricFieldLabel("ctr"), "");

  // 6 percent normalization
  assert.equal(percentInputToRate("12"), 0.12);
  assert.equal(percentInputToRate("0"), 0);
  assert.equal(percentInputToRate("100"), 1);
  assert.equal(percentInputToRate("101"), null);
  const body = createManualMetricsBody({ ...emptyMetricForm(), views: "120", completionRatePercent: "12" });
  assert.equal(body.views, 120);
  assert.equal(body.completionRate, 0.12);
  assert.equal(canSubmitMetrics({ ...emptyMetricForm(), views: "1" }), true);
  assert.equal(canSubmitMetrics(emptyMetricForm()), false);

  // 7 metric source 中文
  assert.equal(metricSourceLabel("MANUAL"), "手工录入");
  assert.equal(metricSourceLabel("IMPORT"), "文件导入");
  assert.equal(metricSourceLabel("DOUYIN_API"), "");

  // 8 metric history sort + zero/null/undefined/negative rendering
  assert.equal(displayMetricValue(0), "0");
  assert.equal(displayMetricValue(null), "—");
  assert.equal(displayMetricValue(undefined), "—");
  assert.equal(displayMetricValue(-2), "-2");
  assert.equal(displayMetricValue(96), "96");
  const history = metricHistoryRows(
    [
      snapshot({ observedAt: "2026-03-02T12:00:00.000Z", views: 80, comments: 0, newFollowers: null }),
      snapshot({
        observedAt: "2026-03-03T12:00:00.000Z",
        views: 96,
        likes: 31,
        comments: 10,
        shares: 3,
        favorites: 3,
        newFollowers: 0,
      }),
    ],
    "2026-03-02T00:00:00.000Z",
  );
  assert.equal(history[0]?.views, "96");
  assert.equal(history[0]?.likes, "31");
  assert.equal(history[0]?.comments, "10");
  assert.equal(history[0]?.shares, "3");
  assert.equal(history[0]?.favorites, "3");
  assert.equal(history[0]?.changeLabel, "0");
  assert.equal(history[1]?.changeLabel, "—");
  const zeroCards = latestMetricCards({
    observedAt: "2026-09-15T14:11:00.000Z",
    views: 96,
    likes: 31,
    comments: 10,
    shares: 3,
    favorites: 3,
    newFollowers: 0,
  });
  assert.equal(zeroCards.find((item) => item.label === "新增粉丝")?.value, "0");
  assert.equal(
    metricHistoryRows([snapshot({ observedAt: "2026-03-04T12:00:00.000Z", newFollowers: -2 })])[0]?.changeLabel,
    "-2",
  );
  const realWindow = metricHistoryRows(
    [
      snapshot({
        observedAt: "2026-09-15T14:11:00.000Z",
        views: 96,
        likes: 31,
        comments: 10,
        shares: 3,
        favorites: 3,
        newFollowers: 0,
      }),
      snapshot({
        observedAt: "2026-09-15T14:20:00.000Z",
        views: 115,
        likes: 42,
        comments: 12,
        shares: 5,
        favorites: 6,
        newFollowers: 1,
      }),
    ],
    "2026-09-15T13:20:00.000Z",
  );
  assert.equal(realWindow[0]?.hoursLabel, "9 分钟");
  assert.equal(realWindow[1]?.hoursLabel, "");
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T15:10:00.000Z"), "59 分钟");
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T15:11:00.000Z"), "1 小时");
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T15:12:00.000Z"), "1 小时 1 分钟");
  const snap1 = snapshot({
    observedAt: "2026-09-15T14:11:00.000Z",
    views: 96,
    likes: 31,
    comments: 10,
    shares: 3,
    favorites: 3,
    newFollowers: 0,
  });
  const snap2 = snapshot({
    observedAt: "2026-09-15T14:20:00.000Z",
    views: 115,
    likes: 42,
    comments: 12,
    shares: 5,
    favorites: 6,
    newFollowers: 1,
  });
  assert.equal(evidenceForInsight("HIGH_VIEWS", snap1, snap2), "播放量从 96 到 115（+19 / +19.8%）");
  assert.equal(evidenceForInsight("HIGH_LIKE_RATE", snap1, snap2), "点赞从 31 到 42（+11 / +35.5%）");
  assert.equal(evidenceForInsight("HIGH_COMMENT_RATE", snap1, snap2), "评论从 10 到 12（+2 / +20%）");
  assert.equal(evidenceForInsight("HIGH_SHARE_RATE", snap1, snap2), "分享从 3 到 5（+2 / +66.7%）");
  assert.equal(evidenceForInsight("HIGH_FAVORITE_RATE", snap1, snap2), "收藏从 3 到 6（+3 / +100%）");
  assert.equal(evidenceForInsight("FOLLOWER_CHANGE", snap1, snap2), "新增粉丝从 0 到 1（+1）");
  assert.equal(evidenceForInsight("HIGH_COMMENT_RATE", snap1, snap2).includes("96"), false);
  assert.equal(evidenceForInsight("HIGH_COMMENT_RATE", snap1, snap2).includes("播放"), false);
  assert.equal(evidenceForInsight("HIGH_ENGAGEMENT_RATE", snap1, snap2).includes("播放量"), false);
  assert.equal(evidenceForInsight("HIGH_LIKE_RATE", { likes: null }, { likes: null }), INSUFFICIENT_EVIDENCE_COPY);
  assert.equal(evidenceForInsight("HIGH_LIKE_RATE", { likes: 5 }, { likes: 3 }), "点赞从 5 到 3（-2 / -40%）");
  const review = performanceReviewItems(
    {
      insights: [
        { code: "HIGH_COMMENT_RATE", confidence: "HIGH" },
        { code: "HIGH_LIKE_RATE", confidence: "HIGH" },
        { code: "HIGH_SHARE_RATE", confidence: "HIGH" },
        { code: "HIGH_FAVORITE_RATE", confidence: "HIGH" },
        { code: "HIGH_ENGAGEMENT_RATE", confidence: "HIGH" },
      ],
    },
    [snap1, snap2],
  );
  assert.equal(review.find((item) => item.id === "HIGH_COMMENT_RATE")?.evidence, "评论从 10 到 12（+2 / +20%）");
  assert.equal(new Set(review.map((item) => item.evidence)).size > 1, true);
  assert.equal(
    review.every((item) => item.id === "HIGH_ENGAGEMENT_RATE" || !item.evidence.includes("播放量从 96")),
    true,
  );
  const persisted = reviewItemsFromAnalysis({
    id: "analysis-1",
    publishedPostId: "01a0a54e-5f54-78c1-a558-76a8d5fcf686",
    recommendations: [
      {
        recommendationId: "rec-comments-cta",
        observation: "评论从 10 到 12（+2 / +20%）",
        evidence: ["评论从 10 到 12（+2 / +20%）"],
        interpretation: "当前样本显示评论互动在这一观察窗口内继续增加。",
        recommendedAction: "下一条内容可继续保留明确提问式 CTA，并测试一个更具体的评论问题。",
        confidence: "MEDIUM",
        uncertainty: "当前只有两次人工采样，不能确认变化是由某个具体镜头造成。",
        category: "CTA",
        reviewStatus: "ACCEPTED",
      },
    ],
  });
  assert.equal(persisted[0]?.observation?.includes("10"), true);
  assert.equal(isActionableRecommendationText(persisted[0]?.recommendedAction), true);
  assert.equal(isActionableRecommendationText("评论互动较活跃"), false);
  assert.equal(REVIEW_SAVE_FAILED, "保存决策失败，请重试");
  assert.equal(persistedDecisionLabel("PENDING"), "未审核");
  assert.equal(persistedDecisionLabel("ACCEPTED"), "已采纳");
  assert.equal(persistedDecisionLabel("REJECTED"), "已不采纳");
  assert.equal(persistedDecisionLabel("DEFERRED"), "稍后再看");
  assert.equal(sortSnapshotsNewestFirst([
    snapshot({ observedAt: "2026-03-02T12:00:00.000Z" }),
    snapshot({ observedAt: "2026-03-03T12:00:00.000Z" }),
  ])[0]?.observedAt, "2026-03-03T12:00:00.000Z");

  // 9 insight code humanization
  assert.equal(humanizePerformanceInsight("HIGH_LIKE_RATE"), "点赞表现较好");
  assert.equal(humanizePerformanceInsight("HIGH_COMMENT_RATE"), "评论互动较活跃");
  assert.equal(insightObservationText("HIGH_LIKE_RATE").includes("当前数据中观察到"), true);
  assert.equal(humanizePerformanceInsight("HIGH_LIKE_RATE").includes("HIGH_LIKE_RATE"), false);

  // 10 no causal language helper
  assert.equal(hasCausalLanguage(insightObservationText("HIGH_LIKE_RATE")), false);
  assert.equal(hasCausalLanguage("因为用了这个标题所以涨粉"), true);
  assert.equal(hasCausalLanguage("这个内容一定会爆"), true);

  const historyView = history[0] ?? {};
  // 11 no raw snapshot fields
  assert.equal(viewModelHasRawContract(historyView), false);
  assert.equal("id" in historyView, false);
  assert.equal("publicationId" in historyView, false);

  // 12 no collectionKey
  assert.equal(JSON.stringify(historyView).includes("collectionKey"), false);
  assert.equal(PERFORMANCE_RAW_TERMS.includes("collectionKey"), true);

  // 13 no provider metadata
  assert.equal(JSON.stringify(historyView).includes("provider"), false);
  assert.equal(JSON.stringify(historyView).includes("sourceJobId"), false);

  // 14 next plan href
  assert.equal(nextPlanHref("proj-1"), "/dashboard/projects/proj-1/content/plans");

  // 15 no auto sync
  assert.equal(autoSyncEnabled(), false);

  // 16 no auto strategy
  assert.equal(autoStrategyEnabled(), false);

  // 17 optimization view does not pretend full PerformanceFeedback
  assert.equal(pretendsFullFeedback(), false);
  assert.equal(optimizationPretendsFullFeedback(), false);
  assert.equal(optimizationScopeNote().includes("完整优化建议"), true);
  assert.equal(feedbackLoopCopy().includes("保留你已选定的推广策略"), true);
  assert.equal(feedbackLoopCopy().includes("自动重写"), false);

  // 18 insufficient data language
  assert.equal(insufficientDataCopy().includes("不足以形成稳定优化建议"), true);
  assert.equal(limitedSampleCopy().includes("多记录几条已发布作品"), true);

  // 19 publication scope switching
  const other = resolvePerformanceQuery("pub-failed", eligiblePerformancePublications(items));
  assert.notEqual(valid.publicationId, other.publicationId);
  assert.equal(optimizationScopeNote().includes("当前所选作品"), true);
  assert.equal(optimizationScopeNote().includes("项目长期建议"), true);

  // 20 mount no writes
  assert.deepEqual(mountWriteOperations(), []);

  console.log("performance selfcheck PASS");
}

run();
