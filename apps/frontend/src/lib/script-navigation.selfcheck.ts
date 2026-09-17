import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { scriptHref } from "./content-planning.form";
import { resolveScriptWorkspaceSelection } from "./script.form";
import type { ContentPlanRecord } from "./content-planning.types";
import type { ScriptRecord } from "./script.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/scripts/page.tsx"), "utf8");

function plan(id: string, version: number, status: string): ContentPlanRecord {
  return {
    id,
    version,
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    payload: {
      title: "计划",
      summary: "摘要",
      topics: [
        { id: "t1", dayIndex: 1, title: "选题一", hook: "h", contentAngle: "a", contentPillar: "p", format: "口播", status: "planned" },
        { id: "t2", dayIndex: 2, title: "选题二", hook: "h", contentAngle: "a", contentPillar: "p", format: "口播", status: "planned" },
      ],
    },
  };
}

function run() {
  assert.match(page, /scriptHref/);
  assert.match(page, /contentPlanId/);
  assert.match(page, /topicId/);
  assert.match(page, /router.replace/);
  assert.match(page, /NextActionBarV1/);
  assert.match(page, /视频制作/);

  const href = scriptHref("proj", "01a0a648-3db7-7191-a91b-621cc99f4751", "topic-1");
  assert.match(href, /contentPlanId=01a0a648-3db7-7191-a91b-621cc99f4751/);
  assert.match(href, /topicId=topic-1/);

  const v2 = plan("01a0a648-3db7-7191-a91b-621cc99f4751", 2, "CONFIRMED");
  const v1 = plan("01a0a0f6-bc2c-7d72-b466-4ea1b60c6f46", 1, "CONFIRMED");
  const oldScript: ScriptRecord = {
    id: "01a0a107-b0e2-7ec1-bf83-776fbd6f8c59",
    contentPlanId: v1.id,
    topicId: "t1",
    version: 1,
    status: "CONFIRMED",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const missingQuery = resolveScriptWorkspaceSelection({
    plans: [v1, v2],
    scripts: [oldScript],
  });
  assert.equal(missingQuery.contentPlanId, v2.id);
  assert.equal(missingQuery.topicId, "t1");

  const direct = resolveScriptWorkspaceSelection({
    plans: [v1, v2],
    scripts: [oldScript],
    queryPlanId: v2.id,
    queryTopicId: "t2",
  });
  assert.equal(direct.contentPlanId, v2.id);
  assert.equal(direct.topicId, "t2");

  console.log("script-navigation selfcheck PASS");
}

run();
