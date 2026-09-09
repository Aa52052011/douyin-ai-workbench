/**
 * Step 12.12P — Script queue / auto-select selfcheck
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentPlanRecord } from "./content-planning.types";
import {
  eligiblePlans,
  resolveScriptQuery,
  resolveScriptWorkspaceSelection,
} from "./script.form";
import type { ScriptRecord } from "./script.types";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = join(here, "..");

function plan(partial: Partial<ContentPlanRecord> & { id: string; status: string; version: number }): ContentPlanRecord {
  return {
    id: partial.id,
    status: partial.status,
    version: partial.version,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    planningDays: 7,
    postsPerDay: 1,
    payload: partial.payload ?? {
      title: "7天计划",
      summary: "摘要",
      planningDays: 7,
      postsPerDay: 1,
      topics: Array.from({ length: 7 }, (_, i) => ({
        id: `t${i + 1}`,
        dayIndex: i + 1,
        title: `选题 ${i + 1}`,
        hook: "h",
        contentAngle: "a",
        contentPillar: "p",
        format: "口播",
        status: "planned",
      })),
    },
  };
}

function script(partial: Partial<ScriptRecord> & { id: string; topicId: string; status: string }): ScriptRecord {
  return {
    id: partial.id,
    contentPlanId: partial.contentPlanId ?? "plan-1",
    topicId: partial.topicId,
    version: partial.version ?? 1,
    status: partial.status,
    createdAt: partial.createdAt ?? "2026-01-02T00:00:00.000Z",
  };
}

function run() {
  const confirmed = plan({ id: "plan-1", status: "CONFIRMED", version: 1 });
  const draft = plan({ id: "plan-2", status: "DRAFT", version: 2 });
  const archived = plan({ id: "plan-old", status: "ARCHIVED", version: 1, createdAt: "2025-01-01T00:00:00.000Z" });
  const plans = [draft, confirmed, archived];

  // CASE 1: 0 scripts → Day1
  let sel = resolveScriptWorkspaceSelection({ plans, scripts: [] });
  assert.equal(sel.contentPlanId, "plan-1");
  assert.equal(sel.topicId, "t1");

  // CASE 2: Day1 confirmed → Day2
  sel = resolveScriptWorkspaceSelection({
    plans,
    scripts: [script({ id: "s1", topicId: "t1", status: "CONFIRMED" })],
  });
  assert.equal(sel.topicId, "t2");

  // CASE 3: Day1 draft only → Day1 current
  sel = resolveScriptWorkspaceSelection({
    plans,
    scripts: [script({ id: "s1d", topicId: "t1", status: "DRAFT" })],
  });
  assert.equal(sel.topicId, "t1");

  // CASE 4: Day1 confirmed + v2 draft → Day2 current, Day1 still ready
  sel = resolveScriptWorkspaceSelection({
    plans,
    scripts: [
      script({ id: "s1", topicId: "t1", status: "CONFIRMED", version: 1 }),
      script({ id: "s1b", topicId: "t1", status: "DRAFT", version: 2 }),
    ],
  });
  assert.equal(sel.topicId, "t2");

  // CASE 5: all scripts confirmed → no topic current
  const allReady = Array.from({ length: 7 }, (_, i) =>
    script({ id: `sx${i}`, topicId: `t${i + 1}`, status: "CONFIRMED" }),
  );
  sel = resolveScriptWorkspaceSelection({ plans, scripts: allReady });
  assert.equal(sel.contentPlanId, "plan-1");
  assert.equal(sel.topicId, "");

  // CASE 6: valid query exact focus
  sel = resolveScriptWorkspaceSelection({
    plans,
    scripts: [],
    queryPlanId: "plan-1",
    queryTopicId: "t4",
  });
  assert.equal(sel.topicId, "t4");
  assert.equal(sel.viewingHistoricalPlan, false);

  // CASE 7: invalid topic → fallback current
  sel = resolveScriptWorkspaceSelection({
    plans,
    scripts: [script({ id: "s1", topicId: "t1", status: "CONFIRMED" })],
    queryPlanId: "plan-1",
    queryTopicId: "missing",
  });
  assert.equal(sel.topicId, "t2");
  assert.match(sel.warning ?? "", /已切换到当前生产计划/);

  // CASE 8: draft plan cannot be default current
  assert.equal(eligiblePlans(plans).some((p) => p.id === "plan-2"), false);
  sel = resolveScriptWorkspaceSelection({ plans, scripts: [] });
  assert.notEqual(sel.contentPlanId, "plan-2");

  // CASE 9: historical confirmed viewable
  sel = resolveScriptWorkspaceSelection({
    plans: [confirmed, archived],
    scripts: [],
    queryPlanId: "plan-old",
    queryTopicId: "t1",
  });
  assert.equal(sel.contentPlanId, "plan-old");
  assert.equal(sel.viewingHistoricalPlan, true);

  // CASE 10: project isolation is API-level; selection only uses provided plans
  sel = resolveScriptWorkspaceSelection({
    plans: [plan({ id: "other", status: "CONFIRMED", version: 1 })],
    scripts: [],
  });
  assert.equal(sel.contentPlanId, "other");

  // Legacy resolveScriptQuery still clears invalid without silent fallback
  const legacy = resolveScriptQuery("plan-2", "t1", eligiblePlans(plans));
  assert.equal(legacy.contentPlanId, "");

  const page = readFileSync(join(frontendSrc, "app/dashboard/projects/[projectId]/content/scripts/page.tsx"), "utf8");
  assert.match(page, /ScriptProductionQueue/);
  assert.match(page, /resolveScriptWorkspaceSelection/);
  assert.match(page, /collapsedByDefault/);
  assert.match(page, /继续制作下一条脚本/);
  assert.match(page, /重新生成只会生成这一条的新脚本版本/);
  assert.equal(page.includes("请选择内容计划"), false); // moved into collapsed secondary form component

  const form = readFileSync(join(frontendSrc, "components/script-source-form.tsx"), "utf8");
  assert.match(form, /切换内容计划/);

  console.log("script-queue / 12.12P selection selfcheck PASS");
}

run();
