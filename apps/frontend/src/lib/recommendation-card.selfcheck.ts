import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { remainingCount, visibleByPersistedOrder } from "./ai-review.workspace";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rec = readFileSync(path.join(root, "components/recommendation-review-v5.tsx"), "utf8");
const card = readFileSync(path.join(root, "components/recommendation-card-v2.tsx"), "utf8");

assert.match(card, /RecommendationCardV2/);
assert.match(card, /采纳/);
assert.match(card, /不采纳/);
assert.match(card, /稍后再看/);
assert.match(card, /更改决定/);
assert.match(card, /decide\("approve"\)/);
assert.match(card, /variant="secondary"/);
assert.match(card, /查看分析依据/);
assert.match(card, /查看决策记录/);
assert.equal(card.includes("改为不采纳"), false);
assert.match(card, /正在保存决策/);
assert.match(card, /保存决策失败，请重试/);
assert.match(card, /重试/);
assert.match(rec, /查看另外/);
assert.equal(visibleByPersistedOrder([1, 2, 3, 4, 5, 6], false).length, 3);
assert.equal(remainingCount(6), 3);
assert.equal(rec.includes("sort("), false);
console.log("recommendation-card selfcheck PASS");
