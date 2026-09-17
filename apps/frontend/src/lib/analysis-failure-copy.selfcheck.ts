import assert from "node:assert/strict";
import { ANALYSIS_GENERATION_FAILED, ANALYSIS_LOAD_FAILED } from "./ai-review.workspace";
import { REVIEW_SAVE_FAILED } from "./performance-review.view";
import { analysisErrorCopy } from "./ux/publication-monitoring-v5";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/performance/page.tsx"), "utf8");
const detail = readFileSync(path.join(root, "app/dashboard/monitoring/[publishedPostId]/page.tsx"), "utf8");

assert.notEqual(ANALYSIS_GENERATION_FAILED, REVIEW_SAVE_FAILED);
assert.notEqual(ANALYSIS_LOAD_FAILED, REVIEW_SAVE_FAILED);
assert.equal(REVIEW_SAVE_FAILED, "保存决策失败，请重试");
assert.equal(analysisErrorCopy().title.includes("复盘"), true);
assert.match(page, /分析生成失败/);
assert.equal(page.includes("复盘建议暂时无法保存"), false);
assert.equal(detail.includes("复盘建议暂时无法保存"), false);
assert.match(detail, /复盘内容加载失败/);
console.log("analysis-failure-copy selfcheck PASS");
