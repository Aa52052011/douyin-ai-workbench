import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { selectWorkspaceScript, scriptBelongsToPlan, scriptWorkspaceStatusLabel } from "./script.workspace";
import type { ScriptRecord } from "./script.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/scripts/page.tsx"), "utf8");

function script(partial: Partial<ScriptRecord> & Pick<ScriptRecord, "id" | "version" | "status">): ScriptRecord {
  return {
    createdAt: "2026-03-01T00:00:00.000Z",
    contentPlanId: partial.contentPlanId ?? "plan-v2",
    topicId: partial.topicId ?? "t1",
    ...partial,
  };
}

function run() {
  assert.match(page, /selectWorkspaceScript/);
  assert.match(page, /scriptBelongsToPlan/);
  assert.match(page, /查看选题详情/);
  assert.match(page, /第 \{focusItem.dayIndex\} 条/);

  const old = script({
    id: "01a0a107-b0e2-7ec1-bf83-776fbd6f8c59",
    version: 1,
    status: "CONFIRMED",
    contentPlanId: "plan-v1",
    topicId: "t1",
  });
  const current = selectWorkspaceScript([old], "plan-v2", "t1");
  assert.equal(current, null);
  assert.equal(scriptBelongsToPlan(old, "plan-v2"), false);
  assert.equal(scriptWorkspaceStatusLabel({ script: null }), "待制作脚本");

  const draft = script({ id: "s-draft", version: 2, status: "DRAFT", contentPlanId: "plan-v2" });
  assert.equal(selectWorkspaceScript([old, draft], "plan-v2", "t1")?.id, "s-draft");
  assert.equal(scriptWorkspaceStatusLabel({ script: draft }), "脚本待确认");
  assert.equal(scriptWorkspaceStatusLabel({ generating: true }), "正在生成脚本");
  assert.equal(scriptWorkspaceStatusLabel({ script: script({ id: "c", version: 1, status: "CONFIRMED" }) }), "脚本已确认");

  console.log("script-context selfcheck PASS");
}

run();
