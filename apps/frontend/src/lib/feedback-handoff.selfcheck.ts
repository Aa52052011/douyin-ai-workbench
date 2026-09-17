import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { acceptedHandoffItems, excludedFromAcceptedHandoff, reviewCountsFromItems } from "./ai-review.workspace";
import { acceptedPreviewItems, reviewItemsFromAnalysis } from "./performance-review.view";
import { notAutoAppliedCopy } from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const handoff = readFileSync(path.join(root, "components/feedback-handoff-ux-v5.tsx"), "utf8");

const items = reviewItemsFromAnalysis({
  id: "01a0a61d-394b-72c0-8312-2f9b19192116",
  publishedPostId: "01a0a54e-5f54-78c1-a558-76a8d5fcf686",
  recommendations: [
    { recommendationId: "rec-views-format", reviewStatus: "ACCEPTED", recommendedAction: "下一条可继续保持清晰的主题包装，便于被发现。不要把播放量变化解释成点赞、评论或分享的原因。" },
    { recommendationId: "rec-likes-engagement", reviewStatus: "REJECTED", recommendedAction: "不该进入回流" },
    { recommendationId: "rec-comments-cta", reviewStatus: "DEFERRED", recommendedAction: "也不该进入回流" },
    { recommendationId: "rec-shares-shareability", reviewStatus: "PENDING" },
    { recommendationId: "rec-favorites-content", reviewStatus: "PENDING" },
    { recommendationId: "rec-followers-audience", reviewStatus: "PENDING" },
  ],
});

const counts = reviewCountsFromItems(items);
assert.equal(counts.accepted, 1);
assert.equal(counts.rejected, 1);
assert.equal(counts.deferred, 1);
assert.equal(counts.pending, 3);
assert.equal(acceptedHandoffItems(items).length, 1);
assert.equal(acceptedPreviewItems(items).length, 1);
assert.equal(excludedFromAcceptedHandoff(items).includes("rec-likes-engagement"), true);
assert.equal(excludedFromAcceptedHandoff(items).includes("rec-comments-cta"), true);
assert.equal(excludedFromAcceptedHandoff(items).includes("rec-shares-shareability"), true);
assert.match(handoff, /FeedbackHandoffSummaryV2/);
assert.match(handoff, /ACCEPTED_ONLY_HANDOFF_COPY/);
assert.match(handoff, /未审核/);
assert.match(handoff, /开始下一轮内容规划/);
assert.match(handoff, /不会自动修改计划/);
assert.equal(handoff.includes("已采纳建议可作为参考"), false);
assert.equal(handoff.includes("这些建议将在下一轮"), false);
assert.equal(handoff.includes("准备应用"), false);
assert.equal(notAutoAppliedCopy().includes("尚未自动应用"), true);
assert.equal(handoff.includes("尚未自动应用"), false);
assert.equal(handoff.includes("已自动优化"), false);
console.log("feedback-handoff selfcheck PASS");
