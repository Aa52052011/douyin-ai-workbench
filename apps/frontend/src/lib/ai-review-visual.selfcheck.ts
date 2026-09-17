import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { eligiblePerformancePublications, resolvePerformanceQuery } from "./performance.form";
import type { PublicationRecord } from "./publication.types";
import {
  resolveAiReviewPublicationSelection,
  sampleSufficiencyCopy,
  visibleByPersistedOrder,
} from "./ai-review.workspace";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function publication(partial: Partial<PublicationRecord> & Pick<PublicationRecord, "id" | "status">): PublicationRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    title: partial.title ?? "已发布作品",
    publishedAt: partial.publishedAt ?? "2026-03-02T00:00:00.000Z",
    ...partial,
  };
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/performance/page.tsx");
  const selector = read("components/performance-publication-selector.tsx");
  const api = read("lib/performance-analysis.api.ts");
  const workspace = read("components/ai-review-workspace-v1.tsx");
  const rec = read("components/recommendation-review-v5.tsx");
  const card = read("components/recommendation-card-v2.tsx");
  const observation = read("components/observation-card-v2.tsx");
  const handoff = read("components/feedback-handoff-ux-v5.tsx");

  assert.match(page, /resolveAiReviewPublicationSelection/);
  assert.match(page, /loadOrCreatePerformanceAnalysis/);
  assert.equal(page.includes("createPerformanceAnalysis("), false);
  assert.equal(page.includes("createContentPlan"), false);
  assert.doesNotMatch(page, /ContextualGuidanceV1/);
  assert.match(page, /还没有可复盘的作品/);
  assert.match(page, /去发布与数据/);
  assert.match(page, /这条作品还没有表现数据/);
  assert.match(page, /录入数据/);
  assert.match(page, /sampleSufficiencyCopy/);
  assert.match(page, /persistRecommendationReviewAndReload/);
  assert.match(page, /开始下一轮内容规划/);
  assert.match(selector, /正在复盘/);
  assert.match(selector, /切换作品/);
  assert.equal(selector.includes("请选择已发布作品"), false);
  assert.equal(page.includes("HIGH_"), false);
  assert.equal(page.includes(">SPARSE<"), false);

  const one = [publication({ id: "01a0a54e-5f54-78c1-a558-76a8d5fcf686", status: "PUBLISHED" })];
  const autoOne = resolveAiReviewPublicationSelection({ eligible: one });
  assert.equal(autoOne.publicationId, "01a0a54e-5f54-78c1-a558-76a8d5fcf686");

  const many = [
    publication({ id: "old", status: "PUBLISHED", publishedAt: "2026-01-01T00:00:00.000Z" }),
    publication({ id: "with-metrics", status: "PUBLISHED", publishedAt: "2026-02-01T00:00:00.000Z" }),
    publication({ id: "newer-empty", status: "PUBLISHED", publishedAt: "2026-03-01T00:00:00.000Z" }),
  ];
  const fromUrl = resolveAiReviewPublicationSelection({
    queryPublicationId: "old",
    eligible: many,
    hasDataById: { old: false, "with-metrics": true, "newer-empty": false },
  });
  assert.equal(fromUrl.publicationId, "old");

  const preferred = resolveAiReviewPublicationSelection({
    eligible: many,
    hasDataById: { old: false, "with-metrics": true, "newer-empty": false },
  });
  assert.equal(preferred.publicationId, "with-metrics");

  const invalidUrl = resolvePerformanceQuery("missing", eligiblePerformancePublications(many));
  assert.equal(invalidUrl.publicationId, "");

  const none = resolveAiReviewPublicationSelection({ eligible: [] });
  assert.equal(none.publicationId, "");

  const sample = sampleSufficiencyCopy([
    { observedAt: "2026-09-15T14:11:00.000Z", views: 96, likes: 31, comments: 10, shares: 3, favorites: 3, newFollowers: 0 },
    { observedAt: "2026-09-15T14:20:00.000Z", views: 115, likes: 42, comments: 12, shares: 5, favorites: 6, newFollowers: 1 },
  ]);
  assert.match(sample, /样本有限/);
  assert.match(sample, /2 次记录/);
  assert.match(sample, /9 分钟/);
  assert.equal(sampleSufficiencyCopy([]), "");

  assert.match(api, /listPerformanceAnalyses/);
  assert.match(api, /createPerformanceAnalysis/);

  assert.match(page, /data-acf-review-sample-copy/);
  assert.equal(selector.includes("样本有限"), false);
  assert.equal(selector.includes("AI_REVIEW_TRUTH_NOTICE"), false);
  assert.match(selector, /登记时间/);
  assert.match(selector, /条数据记录/);
  assert.match(workspace, /查看另外 \{extraObservations\} 条观察/);
  assert.match(observation, /查看解释与限制/);
  assert.match(rec, /查看另外 \{extra\} 条建议/);
  assert.equal(visibleByPersistedOrder([1, 2, 3, 4, 5, 6], false, 3).length, 3);
  assert.match(card, /更改决定/);
  assert.match(card, /showActions = !reviewed \|\| changing/);
  assert.match(handoff, /已采纳 \{acceptedCount\}/);
  assert.match(handoff, /不采纳 \{rejectedCount\}/);
  assert.match(handoff, /稍后再看 \{deferredCount\}/);
  assert.match(handoff, /未审核 \{pendingCount\}/);
  assert.match(handoff, /开始下一轮内容规划/);
  assert.match(page, /查看历史数据/);
  assert.match(page, /<details>/);
  assert.equal(page.includes("createContentPlan"), false);
  assert.equal(handoff.includes("createContentPlan"), false);

  console.log("ai-review visual selfcheck PASS");
}

run();
