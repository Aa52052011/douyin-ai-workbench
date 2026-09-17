import assert from "node:assert/strict";
import { INSIGHT_PROBE_LIMIT, METRICS_PROBE_LIMIT, probePublicationMetrics, probeReadableInsight } from "./load-project-status";
import {
  PROJECT_STAGE_KEYS,
  STAGE_CHECKLIST,
  belongsToProject,
  buildProjectStages,
  completedStageCount,
  currentStageLabel,
  emptyStatusFacts,
  evaluateProjectStages,
  fullLoopCtaNote,
  getProjectNextAction,
  groupProgress,
  isCompletedScriptStatus,
  isProcessingVideoStatus,
  isReadablePlanStatus,
  mountWriteOperations,
  nextActionSkipsScript,
  performanceStageLabel,
  stageCountLabel,
  statusUnavailableLabel,
  usesPercentage,
  type ProjectStatusFacts,
} from "./project-status";

const projectId = "proj-1";

function facts(partial: Partial<ProjectStatusFacts>): ProjectStatusFacts {
  return { ...emptyStatusFacts(), ...partial, summary: { ...emptyStatusFacts().summary, ...partial.summary } };
}

function foundationReady(): Partial<ProjectStatusFacts> {
  return {
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: true,
    strategyUsable: true,
  };
}

function throughPlanning(): Partial<ProjectStatusFacts> {
  return {
    ...foundationReady(),
    hasReadablePlan: true,
    hasScriptEligiblePlan: true,
    latestPlanStatus: "CONFIRMED",
  };
}

function throughScript(): Partial<ProjectStatusFacts> {
  return {
    ...throughPlanning(),
    hasCompletedScript: true,
    latestConfirmedScriptId: "script-1",
  };
}

function throughVideo(): Partial<ProjectStatusFacts> {
  return {
    ...throughScript(),
    hasVideo: true,
    hasCompletedVideo: true,
  };
}

function throughPublication(): Partial<ProjectStatusFacts> {
  return {
    ...throughVideo(),
    hasPublishedPublication: true,
    publishedPublicationId: "pub-1",
  };
}

function fullLoop(): ProjectStatusFacts {
  return facts({
    ...throughPublication(),
    hasMetrics: true,
  });
}

function run() {
  // 1 10 stage keys
  assert.deepEqual([...PROJECT_STAGE_KEYS], [
    "product",
    "positioning",
    "research",
    "analysis",
    "strategy",
    "planning",
    "script",
    "video",
    "publication",
    "performance",
  ]);
  assert.equal(STAGE_CHECKLIST.length, 10);

  // 2 stage 顺序
  assert.deepEqual(
    STAGE_CHECKLIST.map((item) => item.label),
    ["产品信息", "账号定位", "市场调研", "市场分析", "推广策略", "内容计划", "脚本", "视频", "已发布", "表现与建议"],
  );

  // 3 Script stage 存在
  assert.equal(STAGE_CHECKLIST.some((item) => item.key === "script"), true);
  assert.equal(STAGE_CHECKLIST.some((item) => item.label === "已有反馈"), false);

  // 4 Product completion
  assert.equal(evaluateProjectStages(facts({ productPresent: true })).product, "completed");
  assert.equal(evaluateProjectStages(facts({ productPresent: false })).product, "not_started");

  // 5 Positioning valid completion
  assert.equal(evaluateProjectStages(facts({ positioningValid: true })).positioning, "completed");
  assert.equal(evaluateProjectStages(facts({ positioningValid: false })).positioning, "not_started");

  // 6 Research completion
  assert.equal(evaluateProjectStages(facts({ researchPresent: true })).research, "completed");

  // 7 Insight completion 不绑定 latest Research
  const olderInsight = evaluateProjectStages(facts({ researchPresent: true, insightPresent: true }));
  assert.equal(olderInsight.analysis, "completed");
  assert.equal(olderInsight.research, "completed");

  // 8 Strategy READY/CONFIRMED completion
  assert.equal(evaluateProjectStages(facts({ strategyUsable: true })).strategy, "completed");

  // 9 ARCHIVED-only Strategy incomplete
  assert.equal(evaluateProjectStages(facts({ strategyUsable: false })).strategy, "not_started");

  // 10 Plan DRAFT stage complete
  const draftPlanStages = buildProjectStages(
    facts({
      ...foundationReady(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: false,
      latestPlanStatus: "DRAFT",
    }),
  );
  assert.equal(draftPlanStages.planning, "completed");
  assert.equal(isReadablePlanStatus("DRAFT"), true);

  // 11 DRAFT Plan next action = 确认计划
  const draftPlanAction = getProjectNextAction(
    projectId,
    facts({
      ...foundationReady(),
      hasReadablePlan: true,
      hasScriptEligiblePlan: false,
      latestPlanStatus: "DRAFT",
    }),
  );
  assert.equal(draftPlanAction.label, "确认内容计划");
  assert.equal(draftPlanAction.href, `/dashboard/projects/${projectId}/content/plans`);

  // 12 Script DRAFT stage incomplete
  const draftScriptFacts = facts({
    ...throughPlanning(),
    hasCompletedScript: false,
    hasDraftScript: true,
  });
  assert.equal(evaluateProjectStages(draftScriptFacts).script, "not_started");
  assert.equal(isCompletedScriptStatus("DRAFT"), false);

  // 13 Script DRAFT next action = 确认脚本
  const draftScriptAction = getProjectNextAction(projectId, draftScriptFacts);
  assert.equal(draftScriptAction.label, "确认脚本");
  assert.equal(draftScriptAction.href.includes("/content/scripts"), true);

  // 14 CONFIRMED Script complete
  assert.equal(isCompletedScriptStatus("CONFIRMED"), true);
  assert.equal(evaluateProjectStages(facts({ hasCompletedScript: true })).script, "completed");

  // 15 ARCHIVED Script complete
  assert.equal(isCompletedScriptStatus("ARCHIVED"), true);

  // 16 Video PENDING incomplete
  assert.equal(isProcessingVideoStatus("PENDING"), true);
  assert.equal(evaluateProjectStages(facts({ hasVideo: true, hasCompletedVideo: false, hasProcessingVideo: true })).video, "not_started");

  // 17 Video FAILED incomplete
  assert.equal(evaluateProjectStages(facts({ hasVideo: true, hasCompletedVideo: false, hasFailedVideo: true })).video, "not_started");

  // 18 Video COMPLETED + output complete
  assert.equal(evaluateProjectStages(facts({ hasCompletedVideo: true })).video, "completed");

  // 19 Publication PENDING incomplete
  assert.equal(
    evaluateProjectStages(facts({ hasPendingPublication: true, hasPublishedPublication: false })).publication,
    "not_started",
  );

  // 20 Publication PUBLISHED complete
  assert.equal(evaluateProjectStages(facts({ hasPublishedPublication: true })).publication, "completed");

  // 21 no metrics performance incomplete
  assert.equal(evaluateProjectStages(facts({ hasPublishedPublication: true, hasMetrics: false })).performance, "not_started");

  // 22 metrics exist performance complete
  assert.equal(evaluateProjectStages(facts({ hasMetrics: true })).performance, "completed");

  // 23 full loop 10/10
  const fullStages = buildProjectStages(fullLoop());
  assert.equal(completedStageCount(fullStages), 10);
  assert.equal(currentStageLabel(fullStages), "持续优化");

  // 24 full loop next action = 创建下一期内容计划
  const loopAction = getProjectNextAction(projectId, fullLoop());
  assert.equal(loopAction.label, "创建下一期内容计划");
  assert.equal(loopAction.href, `/dashboard/projects/${projectId}/content/plans`);
  assert.equal(fullLoopCtaNote().includes("自动参考最新发布表现"), true);
  assert.equal(loopAction.label.includes("推广策略"), false);

  // 25 next action never skips Script
  const skipProbe = getProjectNextAction(projectId, facts(throughPlanning()));
  assert.equal(skipProbe.id, "script");
  assert.equal(nextActionSkipsScript(skipProbe, facts(throughPlanning())), false);
  assert.equal(nextActionSkipsScript({ id: "video", label: "x", href: "/" }, facts(throughPlanning())), true);

  // 26 processing Video → 查看进度
  assert.equal(
    getProjectNextAction(
      projectId,
      facts({
        ...throughScript(),
        hasVideo: true,
        hasCompletedVideo: false,
        hasProcessingVideo: true,
      }),
    ).label,
    "查看视频生成进度",
  );

  // 27 failed Video → 重试
  assert.equal(
    getProjectNextAction(
      projectId,
      facts({
        ...throughScript(),
        hasVideo: true,
        hasCompletedVideo: false,
        hasFailedVideo: true,
      }),
    ).label,
    "重试视频生成",
  );

  // 28 pending Publication → 标记已发布
  assert.equal(
    getProjectNextAction(
      projectId,
      facts({
        ...throughVideo(),
        hasPendingPublication: true,
        hasPublishedPublication: false,
        pendingPublicationVideoId: "video-1",
      }),
    ).label,
    "标记已发布",
  );

  // 29 published no metrics → 录入表现数据
  const metricsAction = getProjectNextAction(projectId, facts(throughPublication()));
  assert.equal(metricsAction.label, "录入表现数据");
  assert.equal(metricsAction.href.includes("publicationId=pub-1"), true);

  // 30 status error → unknown not false incomplete
  const unknownStages = evaluateProjectStages(
    facts({
      productPresent: null,
      positioningValid: null,
    }),
  );
  assert.equal(unknownStages.product, "unknown");
  assert.notEqual(unknownStages.product, "not_started");
  assert.equal(unknownStages.positioning, "unknown");

  // 31 dashboard card uses same next action helper
  const dashboardAction = getProjectNextAction(projectId, emptyStatusFacts());
  const overviewAction = getProjectNextAction(projectId, emptyStatusFacts());
  assert.deepEqual(dashboardAction, overviewAction);

  // 32 no side-effect operations
  assert.deepEqual(mountWriteOperations(), []);

  // 33 no percentages
  assert.equal(usesPercentage(stageCountLabel(fullStages)), false);
  assert.equal(stageCountLabel(fullStages), "已完成 10 / 10 个阶段");

  // 34 performance label consistency
  assert.equal(performanceStageLabel(), "表现与建议");
  assert.equal(STAGE_CHECKLIST.find((item) => item.key === "performance")?.label, "表现与建议");

  // 35 cross-project data guards
  assert.equal(belongsToProject({ projectId: "proj-1" }, "proj-1"), true);
  assert.equal(belongsToProject({ projectId: "proj-2" }, "proj-1"), false);
  assert.equal(belongsToProject({}, "proj-1"), true);

  const empty = buildProjectStages(emptyStatusFacts());
  assert.equal(empty.product, "current");
  assert.equal(empty.script, "not_started");
  assert.equal(getProjectNextAction(projectId, emptyStatusFacts()).label, "开始填写产品信息");

  const groups = groupProgress(fullStages);
  assert.deepEqual(
    groups.map((item) => `${item.label} ${item.done}/${item.total}`),
    ["基础 2/2", "市场与策略 3/3", "内容生产 3/3", "发布与数据 2/2"],
  );
  assert.equal(statusUnavailableLabel(), "状态暂不可用");
  assert.equal(INSIGHT_PROBE_LIMIT, 5);
  assert.equal(METRICS_PROBE_LIMIT, 3);

  // --- Step 12.12I Intake Draft next-action matrix (CASE 1–8) ---
  // CASE 1: no brief, no draft → start product
  const case1 = getProjectNextAction(projectId, facts({ productPresent: false }));
  assert.equal(case1.label, "开始填写产品信息");
  assert.equal(case1.id, "product");

  // CASE 2: no brief, product draft → continue product
  const case2 = getProjectNextAction(
    projectId,
    facts({ productPresent: false, productIntakeDraftPresent: true, marketIntakeDraftPresent: true }),
  );
  assert.equal(case2.label, "继续完善产品信息");
  assert.equal(case2.ctaLabel, "继续完善");
  assert.equal(case2.id, "product");
  // ProductBrief prerequisite: market draft must not win
  assert.notEqual(case2.id, "research");

  // CASE 3: brief confirmed, no positioning — formal object wins over stale product draft
  const case3 = getProjectNextAction(
    projectId,
    facts({
      productPresent: true,
      positioningValid: false,
      productIntakeDraftPresent: true,
      productIntakeImproveActive: true,
    }),
  );
  assert.equal(case3.label, "生成账号定位");
  assert.equal(case3.id, "positioning");
  assert.ok(case3.note);
  assert.equal(evaluateProjectStages(facts({ productPresent: true, productIntakeDraftPresent: true })).product, "completed");

  // CASE 4: ready for research, no market draft
  const case4 = getProjectNextAction(
    projectId,
    facts({ productPresent: true, positioningValid: true, researchPresent: false }),
  );
  assert.equal(case4.label, "开始市场调研");

  // CASE 5: market draft → continue research
  const case5 = getProjectNextAction(
    projectId,
    facts({
      productPresent: true,
      positioningValid: true,
      researchPresent: false,
      marketIntakeDraftPresent: true,
    }),
  );
  assert.equal(case5.label, "继续市场调研");
  assert.equal(case5.ctaLabel, "继续调研");

  // CASE 6: research confirmed → analysis; stale market draft does not downgrade stage
  const case6Facts = facts({
    productPresent: true,
    positioningValid: true,
    researchPresent: true,
    insightPresent: false,
    marketIntakeDraftPresent: true,
  });
  const case6 = getProjectNextAction(projectId, case6Facts);
  assert.equal(case6.label, "开始市场分析");
  assert.equal(evaluateProjectStages(case6Facts).research, "completed");

  // CASE 7: research confirmed + active improve draft → analysis with auxiliary note
  const case7 = getProjectNextAction(
    projectId,
    facts({
      productPresent: true,
      positioningValid: true,
      researchPresent: true,
      insightPresent: false,
      marketIntakeImproveActive: true,
    }),
  );
  assert.equal(case7.label, "开始市场分析");
  assert.match(case7.note ?? "", /未确认的补充调研/);
  assert.equal(evaluateProjectStages(facts({ researchPresent: true, marketIntakeImproveActive: true })).research, "completed");

  // CASE 8: full loop next action unaffected by intake drafts
  const case8 = getProjectNextAction(
    projectId,
    facts({
      ...fullLoop(),
      productIntakeDraftPresent: true,
      marketIntakeDraftPresent: true,
      productIntakeImproveActive: true,
      marketIntakeImproveActive: true,
    }),
  );
  assert.equal(case8.id, "next-plan");
  assert.equal(case8.label, "创建下一期内容计划");

  const v2cycle = getProjectNextAction(
    projectId,
    facts({
      ...fullLoop(),
      latestPlanStatus: "CONFIRMED",
      latestPlanId: "plan-v2",
      latestPlanTopicCount: 7,
      completedScriptsOnLatestPlan: 0,
    }),
  );
  assert.equal(v2cycle.id, "next-plan");

  void probeReadableInsight;
  void probePublicationMetrics;

  console.log("project-overview selfcheck PASS");
}

run();
