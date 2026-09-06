import assert from "node:assert/strict";
import type { ContentPlanRecord } from "./content-planning.types";
import {
  canArchiveScript,
  canConfirmScript,
  canEditScript,
  canGenerateFromForm,
  canGenerateVideo,
  createScriptBody,
  eligiblePlans,
  emptyScriptForm,
  humanizeScriptError,
  latestScriptForTopic,
  mountWriteOperations,
  resolveScriptQuery,
  scriptsForTopic,
  topicBelongsToPlan,
  videoHref,
} from "./script.form";
import type { ScriptPayloadRecord, ScriptRecord } from "./script.types";
import {
  parseScriptPayload,
  parseTopicSnapshot,
  recentScriptViews,
  scriptHistoryViews,
  scriptStatusLabel,
  scriptView,
  topicSelectorGroups,
  viewModelHasAgentRunFields,
  viewModelHasRawContract,
} from "./script.view";

const validTopics = [
  {
    id: "topic-a",
    dayIndex: 1,
    title: "敏感肌急救",
    contentPillar: "成分解读",
    contentAngle: "先停刺激",
    priority: "high",
    targetAudience: "敏感肌女性",
    hook: "先别再上酸",
    cta: "收藏这份清单",
  },
  {
    id: "topic-b",
    dayIndex: 2,
    title: "屏障修护",
    contentPillar: "修护陪伴",
    contentAngle: "慢慢养稳",
    priority: "medium",
  },
];

const validPlanPayload = {
  title: "7天修护内容计划",
  summary: "覆盖科普",
  topics: validTopics,
};

function plan(
  partial: Partial<ContentPlanRecord> & Pick<ContentPlanRecord, "id" | "version" | "status">,
): ContentPlanRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    payload: partial.payload ?? validPlanPayload,
    title: partial.title ?? "7天修护内容计划",
    ...partial,
  };
}

const validScriptPayload: ScriptPayloadRecord = {
  title: "30秒沟通清单脚本",
  hook: "开口太晚才是坑",
  opening: "先给你一张清单",
  sections: [
    { sequence: 2, narration: "第二段旁白", visualSuggestion: "清单卡片", subtitle: "第二步", duration: 10 },
    { sequence: 1, narration: "第一段旁白", visualSuggestion: "口播出镜", subtitle: "第一步", duration: 8 },
  ],
  ending: "先改一件事",
  cta: "评论区留下一件事",
  totalDuration: 30,
  estimatedWordCount: 140,
  voiceStyle: "冷静中速",
  visualStyle: "口播拆解",
  productionNotes: ["字幕压在安全区"],
};

function script(
  partial: Partial<ScriptRecord> & Pick<ScriptRecord, "id" | "version" | "status">,
): ScriptRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    contentPlanId: partial.contentPlanId ?? "plan-ready",
    topicId: partial.topicId ?? "topic-a",
    title: partial.title ?? "30秒沟通清单脚本",
    payload: partial.payload ?? validScriptPayload,
    topicSnapshot: partial.topicSnapshot ?? { title: "敏感肌急救", contentAngle: "先停刺激" },
    ...partial,
  };
}

function run() {
  const plans = [
    plan({ id: "plan-ready", version: 3, status: "CONFIRMED" }),
    plan({ id: "plan-archived", version: 2, status: "ARCHIVED" }),
    plan({ id: "plan-draft", version: 4, status: "DRAFT" }),
    plan({ id: "plan-bad", version: 5, status: "CONFIRMED", payload: { foo: 1 } }),
  ];

  // 1 + 2 eligible Plan filtering / DRAFT excluded
  assert.deepEqual(
    eligiblePlans(plans).map((item) => item.id),
    ["plan-ready", "plan-archived"],
  );
  assert.equal(
    eligiblePlans(plans).some((item) => item.status === "DRAFT"),
    false,
  );

  // 3 query contentPlanId valid preselect
  const validQuery = resolveScriptQuery("plan-ready", "topic-a", eligiblePlans(plans));
  assert.equal(validQuery.contentPlanId, "plan-ready");
  assert.equal(validQuery.topicId, "topic-a");
  assert.equal(validQuery.warning, null);

  // 4 topicId must belong Plan
  assert.equal(topicBelongsToPlan(plans[0], "topic-a"), true);
  assert.equal(topicBelongsToPlan(plans[0], "topic-other"), false);
  const foreignTopic = resolveScriptQuery("plan-ready", "topic-other", eligiblePlans(plans));
  assert.equal(foreignTopic.contentPlanId, "");
  assert.equal(foreignTopic.topicId, "");
  assert.equal(foreignTopic.warning, "所选内容计划或选题已不可用，请重新选择。");

  // 5 invalid query no fallback
  const draftQuery = resolveScriptQuery("plan-draft", "topic-a", eligiblePlans(plans));
  assert.equal(draftQuery.contentPlanId, "");
  assert.equal(draftQuery.topicId, "");
  assert.notEqual(draftQuery.contentPlanId, "plan-ready");
  const missingQuery = resolveScriptQuery("missing", "topic-a", eligiblePlans(plans));
  assert.equal(missingQuery.contentPlanId, "");
  assert.equal(missingQuery.warning?.includes("不可用"), true);
  const onlyPlan = resolveScriptQuery("plan-ready", null, eligiblePlans(plans));
  assert.equal(onlyPlan.contentPlanId, "");
  assert.equal(onlyPlan.topicId, "");

  // 6 Topic selector grouping
  const groups = topicSelectorGroups(plans[0]);
  assert.deepEqual(
    groups.map((item) => item.heading),
    ["第 1 天", "第 2 天"],
  );
  assert.equal(groups[0].topics[0]?.title, "敏感肌急救");
  assert.equal(groups[0].topics[0]?.id, "topic-a");

  // 7 Script status 中文
  assert.equal(scriptStatusLabel("DRAFT"), "草稿");
  assert.equal(scriptStatusLabel("CONFIRMED"), "已确认");
  assert.equal(scriptStatusLabel("ARCHIVED"), "已归档");
  assert.equal(scriptStatusLabel("DRAFT").includes("DRAFT"), false);

  // 8 + 9 Script payload parse / section sort
  const parsed = parseScriptPayload(validScriptPayload);
  assert.ok(parsed);
  const view = scriptView(parsed!);
  assert.deepEqual(
    view.sections.map((item) => item.sequence),
    [1, 2],
  );
  assert.equal(view.title, "30秒沟通清单脚本");
  assert.equal(view.hook, "开口太晚才是坑");
  assert.equal(view.opening, "先给你一张清单");
  assert.equal(view.ending, "先改一件事");
  assert.equal(view.cta, "评论区留下一件事");
  assert.equal(view.totalDuration, 30);
  assert.equal(view.estimatedWordCount, 140);
  assert.equal(view.voiceStyle, "冷静中速");
  assert.equal(view.visualStyle, "口播拆解");
  assert.equal(view.productionNotes[0], "字幕压在安全区");
  assert.equal(view.sections[0]?.narration, "第一段旁白");
  assert.equal(view.sections[0]?.visualSuggestion, "口播出镜");
  assert.equal(view.sections[0]?.subtitle, "第一步");

  // 10 malformed script rejected
  assert.equal(parseScriptPayload({ title: "only" }), null);
  assert.equal(parseScriptPayload({ ...validScriptPayload, sections: [] }), null);
  assert.equal(parseScriptPayload({ ...validScriptPayload, hook: "" }), null);

  // 11 DRAFT editable
  assert.equal(canEditScript("DRAFT"), true);
  assert.equal(canEditScript("CONFIRMED"), false);
  assert.equal(canEditScript("ARCHIVED"), false);

  // 12 confirm eligibility
  assert.equal(canConfirmScript("DRAFT"), true);
  assert.equal(canConfirmScript("CONFIRMED"), false);

  // 13 archive eligibility
  assert.equal(canArchiveScript("CONFIRMED"), true);
  assert.equal(canArchiveScript("DRAFT"), false);
  assert.equal(canArchiveScript("ARCHIVED"), false);
  assert.equal(canGenerateVideo("CONFIRMED"), true);
  assert.equal(canGenerateVideo("ARCHIVED"), false);

  // 14 regenerate keeps source Plan/Topic
  const form = {
    ...emptyScriptForm(),
    contentPlanId: "plan-ready",
    topicId: "topic-a",
    targetDuration: 30,
    requirements: "口播更短",
  };
  const body = createScriptBody(form);
  const regenerated = createScriptBody(form);
  assert.equal(body.contentPlanId, regenerated.contentPlanId);
  assert.equal(body.topicId, regenerated.topicId);
  assert.equal(body.contentPlanId, "plan-ready");
  assert.equal(body.topicId, "topic-a");
  assert.equal("projectId" in body, false);
  assert.equal("topic" in body, false);
  assert.equal("campaignStrategy" in body, false);
  assert.equal("MarketInsight" in body, false);
  assert.equal(canGenerateFromForm(form), true);

  // 15 history sort
  const history = scriptHistoryViews([
    script({ id: "s1", version: 1, status: "ARCHIVED", createdAt: "2026-03-01T00:00:00.000Z" }),
    script({ id: "s3", version: 3, status: "DRAFT", createdAt: "2026-03-03T00:00:00.000Z" }),
    script({ id: "s2", version: 2, status: "CONFIRMED", createdAt: "2026-03-02T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    history.map((item) => item.version),
    [3, 2, 1],
  );
  assert.deepEqual(
    scriptsForTopic(
      [
        script({ id: "other", version: 9, status: "DRAFT", topicId: "topic-b" }),
        script({ id: "s2", version: 2, status: "CONFIRMED" }),
        script({ id: "s3", version: 3, status: "DRAFT" }),
      ],
      "plan-ready",
      "topic-a",
    ).map((item) => item.version),
    [3, 2],
  );
  assert.equal(latestScriptForTopic([script({ id: "s1", version: 1, status: "DRAFT" }), script({ id: "s3", version: 3, status: "DRAFT" })], "plan-ready", "topic-a")?.version, 3);

  // 16 video handoff href
  assert.equal(videoHref("proj-1", "script-1"), "/dashboard/projects/proj-1/content/videos?scriptId=script-1");

  // 17 no raw topicSnapshot
  const snapshotView = parseTopicSnapshot({ title: "敏感肌急救", contentAngle: "先停刺激", extra: { raw: true } });
  assert.equal(snapshotView?.title, "敏感肌急救");
  assert.equal(snapshotView?.contentAngle, "先停刺激");
  assert.equal(JSON.stringify(snapshotView).includes("topicSnapshot"), false);
  assert.equal(JSON.stringify(history[0]).includes("topicSnapshot"), false);
  assert.equal(JSON.stringify(recentScriptViews([script({ id: "s1", version: 1, status: "DRAFT" })])[0]).includes("topicSnapshot"), false);

  // 18 no AgentRun fields
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasAgentRunFields(view), false);
  assert.equal(JSON.stringify(view).includes("sourceAgentRunId"), false);
  assert.equal(JSON.stringify(view).includes("AgentRun"), false);

  // 19 mount no writes
  assert.deepEqual(mountWriteOperations(), []);

  // 20 query param only preselects, never auto generate
  const noQuery = resolveScriptQuery(null, null, eligiblePlans(plans));
  assert.equal(noQuery.contentPlanId, "");
  assert.equal(noQuery.topicId, "");
  assert.equal(noQuery.warning, null);
  assert.equal(canGenerateFromForm(emptyScriptForm()), false);

  assert.equal(humanizeScriptError({ code: "SCRIPT_TOPIC_NOT_FOUND" }), "所选内容计划或选题已不可用，请重新选择。");
  assert.equal(humanizeScriptError({ code: "CONTENT_PLAN_CONFLICT" }), "所选内容计划或选题已不可用，请重新选择。");
  assert.equal(humanizeScriptError({ code: "UNKNOWN" }), "脚本生成失败，请稍后重试。");
  assert.equal(humanizeScriptError({ code: "UNKNOWN" }).includes("UNKNOWN"), false);

  console.log("script selfcheck PASS");
}

run();
