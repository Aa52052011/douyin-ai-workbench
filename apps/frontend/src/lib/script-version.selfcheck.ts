import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { latestScriptForTopic } from "./script.form";
import type { ScriptRecord } from "./script.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const history = readFileSync(path.join(root, "components/script-history.tsx"), "utf8");

function script(partial: Partial<ScriptRecord> & Pick<ScriptRecord, "id" | "version" | "status">): ScriptRecord {
  return {
    createdAt: "2026-03-01T00:00:00.000Z",
    contentPlanId: "plan-v2",
    topicId: "t1",
    ...partial,
  };
}

function run() {
  assert.match(history, /VersionHistoryDrawerV1/);
  assert.match(history, /只读查看/);
  assert.equal(history.includes("确认脚本"), false);
  assert.equal(history.includes("制作视频"), false);
  assert.equal(history.includes("重新生成"), false);

  const rows = [
    script({ id: "v1", version: 1, status: "CONFIRMED" }),
    script({ id: "v2", version: 2, status: "DRAFT" }),
  ];
  assert.equal(latestScriptForTopic(rows, "plan-v2", "t1")?.id, "v2");
  assert.equal(latestScriptForTopic(rows, "plan-v2", "t1")?.status, "DRAFT");
  assert.equal(latestScriptForTopic([rows[0]], "plan-v2", "t1")?.id, "v1");

  console.log("script-version selfcheck PASS");
}

run();
