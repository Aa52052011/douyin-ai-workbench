import assert from "node:assert/strict";
import { reviewItemsFromAnalysis, persistedDecisionLabel } from "./performance-review.view";

const first = reviewItemsFromAnalysis({
  id: "a1",
  publishedPostId: "p1",
  recommendations: [
    { recommendationId: "rec-views-format", reviewStatus: "ACCEPTED" },
    { recommendationId: "rec-likes-engagement", reviewStatus: "REJECTED" },
    { recommendationId: "rec-comments-cta", reviewStatus: "DEFERRED" },
    { recommendationId: "rec-shares-shareability", reviewStatus: "PENDING" },
  ],
});

const refetched = reviewItemsFromAnalysis({
  id: "a1",
  publishedPostId: "p1",
  recommendations: first.map((item) => ({
    recommendationId: item.id,
    reviewStatus: item.reviewStatus,
  })),
});

assert.equal(first.find((item) => item.id === "rec-views-format")?.reviewStatus, "ACCEPTED");
assert.equal(refetched.find((item) => item.id === "rec-views-format")?.reviewStatus, "ACCEPTED");
assert.equal(persistedDecisionLabel("ACCEPTED"), "已采纳");
assert.equal(first.find((item) => item.id === "rec-likes-engagement")?.reviewStatus, "REJECTED");
assert.equal(refetched.find((item) => item.id === "rec-comments-cta")?.reviewStatus, "DEFERRED");
console.log("review-persistence selfcheck PASS");
