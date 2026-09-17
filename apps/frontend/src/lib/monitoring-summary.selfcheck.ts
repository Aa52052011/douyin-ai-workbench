import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { analysisReadinessCopy } from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const detail = read("app/dashboard/monitoring/[publishedPostId]/page.tsx");
  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const list = read("app/dashboard/monitoring/page.tsx");
  const summary = read("components/metrics-summary-v2.tsx");
  const trend = read("components/metrics-trend-v1.tsx");
  assert.match(detail, /MetricsSummaryV2/);
  assert.match(detail, /MetricsTrendV1/);
  assert.match(publish, /MetricsSummaryV2/);
  assert.match(summary, /data-acf-metrics-summary-v2/);
  assert.match(trend, /目前只有一组数据，再录入一次后可以看到变化趋势/);
  assert.match(list, /下一步/);
  assert.equal(analysisReadinessCopy(0).includes("先录入"), true);
  assert.equal(analysisReadinessCopy(1).includes("一组数据"), true);
  assert.equal(analysisReadinessCopy(2).includes("已有分析结果"), true);
  console.log("monitoring-summary selfcheck PASS");
}

run();
