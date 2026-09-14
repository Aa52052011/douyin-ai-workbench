"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ConfidenceActionCard } from "../../../../../../components/confidence-action-card";
import { ContentPlanningCurrentFocus } from "../../../../../../components/content-planning-current-focus";
import { ContentPlanningForm } from "../../../../../../components/content-planning-form";
import { ContentPlanningHistory } from "../../../../../../components/content-planning-history";
import { ContentPlanningTopics } from "../../../../../../components/content-planning-topics";
import { ContentPlanningWeekOverview } from "../../../../../../components/content-planning-week-overview";
import { EmptyState } from "../../../../../../components/empty-state";
import { ExplanationDetails } from "../../../../../../components/explanation-details";
import { PageHeader } from "../../../../../../components/page-header";
import { ProductionContextHeaderV3, WorkflowFooterV3 } from "../../../../../../components/production-context-header";
import { AITaskState } from "../../../../../../components/ui/ai-task-state";
import { ProductErrorState } from "../../../../../../components/ui/error-state";
import { useAuth } from "../../../../../../lib/auth-context";
import { listCampaignStrategies } from "../../../../../../lib/campaign-strategy.api";
import type { CampaignStrategyRecord } from "../../../../../../lib/campaign-strategy.types";
import {
  defaultPositioningRunId,
  formatStrategyTime,
  humanizeStrategyLimitation,
  parseStrategyOutput,
  positioningOptions,
  strategyConfidenceLabel,
  strategyStatusLabel,
} from "../../../../../../lib/campaign-strategy.view";
import { buildConfidenceActionView } from "../../../../../../lib/confidence-action";
import {
  archiveContentPlan,
  confirmContentPlan,
  createContentPlan,
  listContentPlans,
} from "../../../../../../lib/content-planning.api";
import {
  canArchivePlan,
  canConfirmPlan,
  canGeneratePlan,
  canGenerateScript,
  emptyPlanningForm,
  humanizePlanningError,
  latestPlan,
  positioningHref,
  resolveStrategyQuery,
  usableStrategies,
} from "../../../../../../lib/content-planning.form";
import {
  buildTopicProductionItems,
  findNextProductionAction,
  getCurrentProductionTopic,
  isSevenDaySingleTrack,
  latestConfirmedPlan,
  latestDraftPlan,
  nextActionHref,
  summarizeProductionProgress,
} from "../../../../../../lib/content-planning.production";
import type { ContentPlanRecord, PlanningFormState } from "../../../../../../lib/content-planning.types";
import { formatPlanTime, parsedPlanView, planHistoryViews, planStatusLabel } from "../../../../../../lib/content-planning.view";
import { listPositioningRuns } from "../../../../../../lib/positioning.api";
import { completedPositioningRecords } from "../../../../../../lib/positioning.form";
import type { PositioningRecord } from "../../../../../../lib/positioning.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
import { listPublications } from "../../../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../../../lib/publication.types";
import { listScripts } from "../../../../../../lib/script.api";
import type { ScriptRecord } from "../../../../../../lib/script.types";
import { listVideos } from "../../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../../lib/video.types";

function ContentPlansPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryStrategyId = searchParams.get("strategyId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [positioning, setPositioning] = useState<PositioningRecord[]>([]);
  const [strategies, setStrategies] = useState<CampaignStrategyRecord[]>([]);
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [form, setForm] = useState<PlanningFormState>(emptyPlanningForm(project.platform || "douyin"));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [regenerateAsk, setRegenerateAsk] = useState(false);
  const [strategyByPlanId, setStrategyByPlanId] = useState<Record<string, string>>({});
  const [userSelectedTopicId, setUserSelectedTopicId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listPositioningRuns(accessToken, projectId),
      listCampaignStrategies(accessToken, projectId),
      listContentPlans(accessToken, projectId),
      listScripts(accessToken, projectId),
      listVideos(accessToken, projectId),
      listPublications(accessToken, projectId),
    ]).then(([positioningResult, strategyResult, planResult, scriptResult, videoResult, publicationResult]) => {
      if (cancelled) {
        return;
      }
      if (positioningResult.status === "rejected" || strategyResult.status === "rejected") {
        setLoadError("无法加载内容计划所需信息，请刷新重试。");
        setLoading(false);
        return;
      }
      const nextPositioning = completedPositioningRecords(positioningResult.value);
      const nextStrategies = strategyResult.value;
      setPositioning(nextPositioning);
      setStrategies(nextStrategies);
      if (planResult.status === "fulfilled") {
        setPlans(planResult.value);
        setPlanError(null);
      } else {
        setPlans([]);
        setPlanError("无法加载内容计划。");
      }
      setScripts(scriptResult.status === "fulfilled" ? scriptResult.value : []);
      setVideos(videoResult.status === "fulfilled" ? videoResult.value : []);
      setPublications(publicationResult.status === "fulfilled" ? publicationResult.value : []);
      const resolved = resolveStrategyQuery(queryStrategyId, nextStrategies);
      setQueryWarning(resolved.warning);
      setForm({
        ...emptyPlanningForm(project.platform || "douyin"),
        positioningRunId: defaultPositioningRunId(nextPositioning),
        strategyId: resolved.strategyId,
      });
      setEditing(false);
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, project.platform, queryStrategyId]);

  const latest = latestPlan(plans);
  const productionPlan = latestConfirmedPlan(plans);
  const draftPlan = latestDraftPlan(plans);
  const pendingNewDraft =
    Boolean(draftPlan && canConfirmPlan(draftPlan.status) && productionPlan && draftPlan.id !== productionPlan.id);

  // Production SoT = latest confirmed. Solo draft (no confirmed yet) is shown for confirm preview.
  const displayPlan = productionPlan ?? draftPlan ?? latest;
  const displayView = displayPlan ? parsedPlanView(displayPlan) : null;

  const productionItems = useMemo(() => {
    if (!displayPlan) return [];
    return buildTopicProductionItems({
      plan: displayPlan,
      scripts,
      videos,
      publications,
    });
  }, [displayPlan, scripts, videos, publications]);

  const progress = summarizeProductionProgress(productionItems);
  const currentTopic = getCurrentProductionTopic(productionItems);
  const nextAction = findNextProductionAction(productionItems);
  const focusTopic =
    productionItems.find((item) => item.topicId === userSelectedTopicId) ??
    currentTopic ??
    productionItems[0] ??
    null;
  const isSevenDay = displayPlan ? isSevenDaySingleTrack(displayPlan, productionItems.length) : false;

  const usable = usableStrategies(strategies);
  const strategyOptions = [...usable]
    .sort((a, b) => b.version - a.version)
    .map((item) => {
      const parsed = parseStrategyOutput(item.payload);
      return {
        id: item.id,
        label: [
          `版本 ${item.version}`,
          strategyStatusLabel(item.status),
          parsed?.objective?.primaryObjective || parsed?.objective?.businessGoal || "",
          strategyConfidenceLabel(parsed?.confidence),
          formatStrategyTime(item.createdAt),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
  const selectedStrategy = strategies.find((item) => item.id === form.strategyId);
  const planStrategy = selectedStrategy;
  const planStrategyParsed = planStrategy ? parseStrategyOutput(planStrategy.payload) : null;
  const planningConfidence =
    projectId && planStrategyParsed
      ? buildConfidenceActionView({
          confidence: planStrategyParsed.confidence,
          limitationCodes: planStrategyParsed.dataLimitations,
          projectId,
          context: "planning",
        })
      : null;
  const currentStrategyLabel = displayPlan ? strategyByPlanId[displayPlan.id] : undefined;
  const confirmedMode = Boolean(displayPlan && canGenerateScript(displayPlan.status));
  // Only the plan currently on screen awaiting confirm — not a sibling draft banner case.
  const pendingConfirmMode = Boolean(displayPlan && canConfirmPlan(displayPlan.status));

  async function generate() {
    if (!accessToken || !projectId || pending || !canGeneratePlan(form)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const created = await createContentPlan(accessToken, projectId, form);
      const rows = await listContentPlans(accessToken, projectId);
      setPlans(rows);
      const strategyLabel = form.strategyId
        ? `本计划使用：推广策略 · 版本 ${selectedStrategy?.version ?? ""}`.trim()
        : "未使用推广策略";
      setStrategyByPlanId((current) => ({ ...current, [created.id]: strategyLabel }));
      setEditing(false);
      setRegenerateAsk(false);
    } catch (error) {
      setActionError(humanizePlanningError(error, "generate"));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    const target =
      pendingNewDraft && draftPlan
        ? draftPlan
        : displayPlan && canConfirmPlan(displayPlan.status)
          ? displayPlan
          : latest;
    if (!accessToken || !target || pending || !canConfirmPlan(target.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await confirmContentPlan(accessToken, target.id);
      setPlans(await listContentPlans(accessToken, projectId));
    } catch (error) {
      setActionError(humanizePlanningError(error, "confirm"));
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    const target = productionPlan ?? latest;
    if (!accessToken || !target || pending || !canArchivePlan(target.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await archiveContentPlan(accessToken, target.id);
      setPlans(await listContentPlans(accessToken, projectId));
      setArchiveAsk(false);
    } catch (error) {
      setActionError(humanizePlanningError(error, "archive"));
    } finally {
      setPending(false);
    }
  }

  const confirmFocusHref =
    confirmedMode && productionPlan && nextAction.kind !== "COMPLETE"
      ? nextActionHref(projectId, productionPlan.id, nextAction)
      : null;

  return (
    <div>
      <PageHeader
        title={isSevenDay ? "本期 7 天内容规划" : "本期内容规划"}
        description="看清这一周期要发什么、为什么发、优先做哪条。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "内容计划" },
        ]}
      />
      <ProductionContextHeaderV3
        projectName={project.name}
        stageId="planning"
        completed={displayPlan && canGenerateScript(displayPlan.status) ? ["positioning", "planning"] : ["positioning"]}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载内容计划…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && planError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {planError}
        </p>
      ) : null}

      {!loading && !loadError && positioning.length === 0 ? (
        <EmptyState
          title="还没有账号定位"
            description="先完成账号定位，才能创建内容计划。"
          primaryAction={{ label: "去生成账号定位", href: positioningHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && positioning.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}

          {pending && editing ? (
            <AITaskState state="RUNNING" stages={["正在规划内容", "正在整理选题", "正在生成计划"]} />
          ) : null}
          {actionError ? (
            <ProductErrorState title="内容计划没有完成" humanMessage={actionError} recoveryAction="稍后重试" />
          ) : null}

          {!latest && !editing ? (
            <EmptyState
              title="还没有内容计划"
              description="选择账号定位和推广策略，生成接下来几天的内容选题。"
              primaryAction={{ label: "创建内容计划", onClick: () => setEditing(true) }}
            />
          ) : null}

          {editing ? (
            <ContentPlanningForm
              form={form}
              positioningOptions={positioningOptions(positioning)}
              strategyOptions={strategyOptions}
              pending={pending}
              noStrategyHint={!form.strategyId}
              positioningSummary={positioning.find((item) => item.runId === form.positioningRunId)?.output.accountPositioning}
              onChange={setForm}
              onSubmit={() => void generate()}
              onCancel={latest ? () => setEditing(false) : undefined}
            />
          ) : null}

          {!editing && displayPlan && !displayView ? <p className="text-sm text-neutral-600">该版本无法读取</p> : null}

          {!editing && displayPlan && displayView ? (
            <div className="space-y-4">
              {pendingNewDraft && draftPlan ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm">
                  <p className="font-medium text-neutral-900">有一份待确认的新规划（版本 {draftPlan.version}）</p>
                  <p className="mt-1 text-neutral-700">
                    当前生产仍使用已确认计划。确认新规划后，它才会成为本期生产计划；旧计划历史会保留。
                  </p>
                  <button
                    className="mt-2 rounded-md bg-neutral-950 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    type="button"
                    disabled={pending}
                    onClick={() => void confirm()}
                  >
                    确认新规划
                  </button>
                </section>
              ) : null}

              <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-neutral-950">{displayView.title}</h2>
                    {displayView.summary ? <p className="mt-1 text-neutral-600">{displayView.summary}</p> : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      {[
                        `版本 ${displayPlan.version}`,
                        planStatusLabel(displayPlan.status),
                        formatPlanTime(displayPlan.createdAt),
                        `${progress.topicCount} 条选题`,
                        confirmedMode ? progress.summaryLabel : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {confirmedMode ? (
                    <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">已确认</span>
                  ) : null}
                </div>
                {planningConfidence?.level === "low" ? (
                  <p className="mt-2 text-xs text-amber-900">本轮为验证型内容计划 · 仍可继续制作脚本</p>
                ) : null}
              </section>

              <ContentPlanningWeekOverview
                items={productionItems}
                progress={progress}
                isSevenDay={isSevenDay}
                currentTopicId={confirmedMode ? currentTopic?.topicId : null}
                selectedTopicId={focusTopic?.topicId}
                onSelect={setUserSelectedTopicId}
              />

              {displayPlan && displayView ? (
                <ContentPlanningTopics
                  view={displayView}
                  projectId={projectId}
                  planId={displayPlan.id}
                  canScript={canGenerateScript(displayPlan.status)}
                />
              ) : null}

              {focusTopic && displayPlan ? (
                <ContentPlanningCurrentFocus
                  projectId={projectId}
                  planId={displayPlan.id}
                  topic={focusTopic}
                  action={nextAction}
                  canScript={canGenerateScript(displayPlan.status)}
                  isCurrentProduction={confirmedMode && focusTopic.topicId === currentTopic?.topicId}
                />
              ) : null}

              {planningConfidence ? (
                <ConfidenceActionCard
                  view={planningConfidence}
                  continueLabel={
                    confirmedMode && confirmFocusHref
                      ? nextAction.kind === "SCRIPT"
                        ? "为这个选题生成脚本"
                        : nextAction.label
                      : undefined
                  }
                  continueHref={confirmFocusHref ?? undefined}
                />
              ) : null}

              <ExplanationDetails summary="为什么这样规划">
                <p>
                  当前推广策略：
                  {planStrategy
                    ? `版本 ${planStrategy.version}${
                        planStrategyParsed?.objective?.primaryObjective
                          ? ` · ${planStrategyParsed.objective.primaryObjective}`
                          : ""
                      }`
                    : currentStrategyLabel || "未绑定策略"}
                </p>
                <p>
                  账号定位：
                  {positioning.find((item) => item.runId === form.positioningRunId)?.output.accountPositioning ??
                    "已选择的账号定位"}
                </p>
                <p>
                  计划目标：{displayPlan.planningDays ?? displayView.days ?? form.planningDays} 天 · 每天{" "}
                  {displayPlan.postsPerDay ?? form.postsPerDay} 条选题
                </p>
                {planStrategyParsed?.dataLimitations?.length ? (
                  <p>
                    市场分析限制：
                    {planStrategyParsed.dataLimitations.map(humanizeStrategyLimitation).join("；")}
                    。本轮更适合作为验证型计划。
                  </p>
                ) : (
                  <p>市场分析限制：当前未额外标注限制，仍建议用首轮内容验证。</p>
                )}
                <p>历史表现反馈：若已有发布数据，下一轮计划会更能贴合真实表现；当前不阻塞继续做脚本。</p>
              </ExplanationDetails>

              <div className="flex flex-wrap gap-2">
                {pendingConfirmMode ? (
                  <button
                    className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                    type="button"
                    disabled={pending}
                    onClick={() => void confirm()}
                  >
                    确认内容计划
                  </button>
                ) : null}
                {confirmedMode && confirmFocusHref ? (
                  <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={confirmFocusHref}>
                    {nextAction.kind === "COMPLETE" ? nextAction.label : nextAction.label}
                  </Link>
                ) : null}
                <button
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
                  type="button"
                  disabled={pending}
                  onClick={() => setRegenerateAsk(true)}
                  title="会基于当前策略重新生成一套新的本期内容规划；现有计划历史会保留。"
                >
                  重新规划本周内容
                </button>
                {productionPlan && canArchivePlan(productionPlan.status) ? (
                  <button
                    className="rounded-md border px-4 py-2 text-sm"
                    type="button"
                    disabled={pending}
                    onClick={() => setArchiveAsk(true)}
                  >
                    归档计划
                  </button>
                ) : null}
              </div>

              {pendingConfirmMode ? (
                <p className="text-sm text-neutral-600">确认后，将进入脚本阶段。回看定位不会清空这份计划。</p>
              ) : null}

              {regenerateAsk ? (
                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
                  <p>会基于当前策略重新生成一套新的本期内容规划；现有计划历史会保留，不会覆盖旧版本。</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md bg-neutral-950 px-3 py-1.5 text-white"
                      type="button"
                      onClick={() => {
                        setRegenerateAsk(false);
                        setEditing(true);
                      }}
                    >
                      继续重新规划
                    </button>
                    <button className="rounded-md border px-3 py-1.5" type="button" onClick={() => setRegenerateAsk(false)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : null}

              {archiveAsk ? (
                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
                  <p>归档后，这份计划不再作为当前生产计划使用。</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md bg-neutral-950 px-3 py-1.5 text-white"
                      type="button"
                      disabled={pending}
                      onClick={() => void archive()}
                    >
                      确认归档
                    </button>
                    <button className="rounded-md border px-3 py-1.5" type="button" onClick={() => setArchiveAsk(false)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <ContentPlanningHistory
            items={planHistoryViews(plans, strategyByPlanId)}
            projectId={projectId}
            resolveView={(version) => {
              const record = plans.find((item) => item.version === version);
              if (!record) {
                return null;
              }
              return { record, view: parsedPlanView(record) };
            }}
          />
        </div>
      ) : null}
      <WorkflowFooterV3 projectId={projectId} stageId="planning" />
    </div>
  );
}

export default function ContentPlansPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">正在加载内容计划…</p>}>
      <ContentPlansPageInner />
    </Suspense>
  );
}
