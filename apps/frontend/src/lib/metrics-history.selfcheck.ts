import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const history = read("components/metrics-history-v5.tsx");
  const detail = read("app/dashboard/monitoring/[publishedPostId]/page.tsx");
  assert.match(history, /查看全部历史/);
  assert.match(history, /slice\(0, 3\)/);
  assert.equal(history.includes("PerformanceHistory"), false);
  assert.equal(detail.includes("<PerformanceHistory"), false);
  assert.match(history, /新增粉丝/);
  assert.equal((history.match(/<table/g) ?? []).length, 1);
  console.log("metrics-history selfcheck PASS");
}

run();
