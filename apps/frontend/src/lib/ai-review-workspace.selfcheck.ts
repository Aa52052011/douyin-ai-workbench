import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { reviewItemsFromAnalysis } from "./performance-review.view";
import {
  AI_REVIEW_TRUTH_NOTICE,
  acceptedHandoffItems,
  analysisSufficiencyUserLabel,
  excludedFromAcceptedHandoff,
  observationCardsFromRecommendations,
  observationContext,
  recommendationDisplayTitle,
  remainingCount,
  reviewCountsFromItems,
  reviewHeaderStatus,
  reviewStatusUserLabel,
  visibleByPersistedOrder,
  looksLikeInternalCode,
} from "./ai-review.workspace";
import { hoursSince } from "./performance.form";
import { hasCausalLanguage } from "./performance.view";
import { mayShowBenchmarkClaim, mayShowRetentionClaim, notAutoAppliedCopy } from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const fixture = reviewItemsFromAnalysis({
  id: "01a0a61d-394b-72c0-8312-2f9b19192116",
  publishedPostId: "01a0a54e-5f54-78c1-a558-76a8d5fcf686",
  recommendations: [
    { recommendationId: "rec-views-format", reviewStatus: "ACCEPTED", observation: "播放量从 96 到 115（+19 / +19.8%）", evidence: ["播放量从 96 到 115（+19 / +19.8%）"], recommendedAction: "下一条可继续保持清晰的主题包装，便于被发现。不要把播放量变化解释成点赞、评论或分享的原因。", interpretation: "当前样本显示播放量在这一观察窗口内有变化。", uncertainty: "当前只有两次人工采样，不能确认变化是由某个具体镜头、文案或 CTA 单独造成。" },
    { recommendationId: "rec-likes-engagement", reviewStatus: "REJECTED", observation: "点赞从 31 到 42（+11 / +35.5%）", evidence: ["点赞从 31 到 42（+11 / +35.5%）"], recommendedAction: "下一条内容可继续测试当前主题和价值表达。" },
    { recommendationId: "rec-comments-cta", reviewStatus: "DEFERRED", observation: "评论从 10 到 12（+2 / +20%）", evidence: ["评论从 10 到 12（+2 / +20%）"], recommendedAction: "下一条内容可继续保留明确提问式 CTA。" },
    { recommendationId: "rec-shares-shareability", reviewStatus: "PENDING", observation: "分享从 3 到 5（+2 / +66.7%）", evidence: ["分享从 3 到 5（+2 / +66.7%）"], recommendedAction: "下一条可尝试增加方便转发的结构。" },
    { recommendationId: "rec-favorites-content", reviewStatus: "PENDING", observation: "收藏从 3 到 6（+3 / +100%）", evidence: ["收藏从 3 到 6（+3 / +100%）"], recommendedAction: "下一条可尝试加入清单、步骤、模板或可保存信息。" },
    { recommendationId: "rec-followers-audience", reviewStatus: "PENDING", observation: "新增粉丝从 0 到 1（+1）", evidence: ["新增粉丝从 0 到 1（+1）"], recommendedAction: "可继续强化账号定位与系列化主题。" },
  ],
});

function run() {
  const page = read("app/dashboard/projects/[projectId]/performance/page.tsx");
  const rec = read("components/recommendation-review-v5.tsx");
  const card = read("components/recommendation-card-v2.tsx");
  const handoff = read("components/feedback-handoff-ux-v5.tsx");
  assert.match(page, /AI复盘/);
  assert.match(page, /根据真实数据总结变化/);
  assert.match(page, /AI_REVIEW_TRUTH_NOTICE/);
  assert.match(page, /MetricsSummaryV2/);
  assert.match(page, /RecommendationReviewV5/);
  assert.match(page, /persistRecommendationReviewAndReload/);
  assert.match(page, /分析生成失败/);
  assert.equal(page.includes("完整AI复盘已完成"), false);
  assert.equal(page.includes("已自动优化"), false);
  assert.equal(page.includes("高于行业平均"), false);
  assert.equal(AI_REVIEW_TRUTH_NOTICE.includes("不会自动应用"), true);
  assert.equal(reviewHeaderStatus(true), "已生成复盘");
  assert.equal(reviewHeaderStatus(false, "SPARSE"), "数据较少");
  assert.equal(analysisSufficiencyUserLabel("GOOD"), "数据较充分");
  assert.equal(analysisSufficiencyUserLabel("GOOD").includes("优秀"), false);
  assert.equal(recommendationDisplayTitle({ id: "rec-views-format" }), "保持清晰的主题包装");
  assert.equal(recommendationDisplayTitle({ id: "rec-views-format" }).includes("rec-"), false);
  assert.equal(reviewStatusUserLabel("ACCEPTED"), "已采纳");
  assert.equal(reviewStatusUserLabel("REJECTED"), "不采纳");
  assert.equal(reviewStatusUserLabel("DEFERRED"), "稍后再看");
  assert.equal(reviewStatusUserLabel("PENDING"), "未审核");
  const counts = reviewCountsFromItems(fixture);
  assert.deepEqual(counts, { accepted: 1, rejected: 1, deferred: 1, pending: 3, total: 6 });
  assert.equal(visibleByPersistedOrder(fixture, false, 3).length, 3);
  assert.equal(remainingCount(6, 3), 3);
  assert.match(rec, /查看另外/);
  assert.match(card, /建议/);
  assert.match(card, /依据/);
  assert.match(card, /更改决定/);
  assert.match(card, /查看分析依据/);
  assert.equal(card.includes("HIGH_COMMENT_RATE"), false);
  assert.equal(page.includes("HIGH_COMMENT_RATE"), false);
  const comments = fixture.find((item) => item.id === "rec-comments-cta");
  assert.equal(comments?.evidence.includes("96"), false);
  assert.equal(comments?.evidence.includes("播放"), false);
  const accepted = acceptedHandoffItems(fixture);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.action.includes("主题包装"), true);
  assert.deepEqual(excludedFromAcceptedHandoff(fixture).sort(), [
    "rec-comments-cta",
    "rec-favorites-content",
    "rec-followers-audience",
    "rec-likes-engagement",
    "rec-shares-shareability",
  ]);
  assert.equal(handoff.includes("已自动应用"), false);
  assert.equal(notAutoAppliedCopy().includes("尚未自动应用"), true);
  assert.equal(mayShowBenchmarkClaim(false), false);
  assert.equal(mayShowRetentionClaim(null), false);
  const span = observationContext([
    { observedAt: "2026-09-15T14:11:00.000Z", views: 96 },
    { observedAt: "2026-09-15T14:20:00.000Z", views: 115 },
  ]);
  assert.equal(span.countLabel, "2 次");
  assert.equal(span.spanLabel, "9 分钟");
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T14:20:00.000Z"), "9 分钟");
  const observations = observationCardsFromRecommendations(fixture);
  assert.equal(hasCausalLanguage(observations[0]?.interpretation || ""), false);
  assert.equal(looksLikeInternalCode("HIGH_LIKE_RATE"), true);
  assert.match(page, /开始下一轮内容规划/);
  assert.equal(page.includes("createContentPlan"), false);
  console.log("ai-review-workspace selfcheck PASS");
}

run();
