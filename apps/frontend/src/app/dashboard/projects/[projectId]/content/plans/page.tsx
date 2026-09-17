"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ContentPlanningForm } from "../../../../../../components/content-planning-form";
import { ContentPlanningHistory } from "../../../../../../components/content-planning-history";
import { ContentPlanningTopics } from "../../../../../../components/content-planning-topics";
import { EmptyState } from "../../../../../../components/empty-state";
import { WorkflowPageHeaderV1 } from "../../../../../../components/workflow-page-header-v1";
import { LearningContextSummaryV1 } from "../../../../../../components/learning-context-summary-v1";
import { PlanningAcceptedFeedbackNotice } from "../../../../../../components/planning-accepted-feedback-notice";
import { ProductionContextHeaderV3 } from "../../../../../../components/production-context-header";
import { AsyncTaskProgressV1 } from "../../../../../../components/async-task-progress-v1";
import { InlineActionErrorV1 } from "../../../../../../components/inline-action-error-v1";
import { NextActionBarV1 } from "../../../../../../components/next-action-bar-v1";
import { Button } from "../../../../../../components/ui/button";
import { Skeleton } from "../../../../../../components/ui/feedback";
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
  selectDisplayPlan,
  usableStrategies,
} from "../../../../../../lib/content-planning.form";
import {
  buildTopicProductionItems,
  findNextProductionAction,
  nextActionHref,
  summarizeProductionProgress,
} from "../../../../../../lib/content-planning.production";
import type { ContentPlanRecord, PlanningFormState } from "../../../../../../lib/content-planning.types";
import { parsedPlanView, planHistoryViews, planStatusLabel } from "../../../../../../lib/content-planning.view";
import { listPositioningRuns } from "../../../../../../lib/positioning.api";
import { completedPositioningRecords } from "../../../../../../lib/positioning.form";
import type { PositioningRecord } from "../../../../../../lib/positioning.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
import { adjacentProjectNav } from "../../../../../../lib/project-nav";
import { listAcceptedPerformanceFeedback } from "../../../../../../lib/performance-analysis.api";
import type { AcceptedPerformanceFeedbackItem } from "../../../../../../lib/performance-analysis.api";
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
  const [acceptedFeedback, setAcceptedFeedback] = useState<AcceptedPerformanceFeedbackItem[]>([]);
  const [preferConfirmed, setPreferConfirmed] = useState(false);
  const flow = adjacentProjectNav(`/dashboard/projects/${projectId}/content/plans`, projectId);

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
      listAcceptedPerformanceFeedback(accessToken, projectId),
    ]).then(([positioningResult, strategyResult, planResult, scriptResult, videoResult, publicationResult, acceptedResult]) => {
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
      setAcceptedFeedback(
        acceptedResult.status === "fulfilled" && Array.isArray(acceptedResult.value.items)
          ? acceptedResult.value.items
          : [],
      );
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
  const selected = selectDisplayPlan(plans);
  const productionPlan = selected.confirmed;
  const draftPlan = selected.draft;
  const pendingNewDraft = selected.draftPriority;
  const displayPlan = preferConfirmed && selected.confirmed ? selected.confirmed : selected.display;
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
  const nextAction = findNextProductionAction(productionItems);

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
      setPreferConfirmed(false);
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
    confirmedMode && displayPlan && nextAction.kind !== "COMPLETE"
      ? nextActionHref(projectId, displayPlan.id, nextAction)
      : null;

  const currentPositioning = positioning.find((item) => item.runId === form.positioningRunId) ?? positioning[0];
  const publishedCount = publications.filter((item) => item.status === "PUBLISHED").length;

  return (
    <div>
      <WorkflowPageHeaderV1
        page="content-plan"
        projectId={projectId}
        title="内容计划"
        description={displayPlan && !editing ? undefined : "查看并确认本期要制作的内容。"}
        compact={Boolean(displayPlan && !editing)}
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "内容计划" },
        ]}
      />
      {(!displayPlan || editing) && positioning.length > 0 ? (
        <ProductionContextHeaderV3
          projectName={project.name}
          stageId="planning"
          completed={displayPlan && canGenerateScript(displayPlan.status) ? ["positioning", "planning"] : ["positioning"]}
        />
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!loading && loadError ? <InlineActionErrorV1 message={loadError} /> : null}
      {!loading && !loadError && planError ? <InlineActionErrorV1 message={planError} /> : null}

      {!loading && !loadError && positioning.length === 0 ? (
        <EmptyState
          title="还没有账号定位"
          description="告诉 AI 你的业务和目标，先完成账号定位。"
          primaryAction={{ label: "开始定位", href: positioningHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && positioning.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-[var(--acf-danger)]" role="alert">
              {queryWarning}
            </p>
          ) : null}

          {!editing && !(displayPlan && displayView) ? (
            <LearningContextSummaryV1
              positioning={currentPositioning?.output}
              acceptedFeedback={acceptedFeedback}
              publishedCount={publishedCount || undefined}
              showIgnoreControl={editing || regenerateAsk}
              ignored={form.ignoreAcceptedPerformanceFeedback}
              onToggleIgnore={(ignored) => setForm({ ...form, ignoreAcceptedPerformanceFeedback: ignored })}
              generatedPlan={Boolean(displayPlan && canGenerateScript(displayPlan.status))}
            />
          ) : null}
          {editing ? (
            <PlanningAcceptedFeedbackNotice
              items={acceptedFeedback}
              ignored={form.ignoreAcceptedPerformanceFeedback}
              showIgnoreControl
              onToggleIgnore={(ignored) => setForm({ ...form, ignoreAcceptedPerformanceFeedback: ignored })}
            />
          ) : null}

          {pending && editing ? (
            <AsyncTaskProgressV1
              status="RUNNING"
              label="AI 正在规划本期内容"
              stages={[{ id: "plan", label: "正在整理选题", state: "current" }]}
              canLeave
            />
          ) : null}
          {actionError ? <InlineActionErrorV1 message={actionError} /> : null}

          {!latest && !editing ? (
            <EmptyState
              title="还没有内容计划"
              description="确认账号定位后，AI 可以规划本期内容。"
              primaryAction={{ label: "生成内容计划", onClick: () => setEditing(true) }}
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
              acceptedFeedback={acceptedFeedback}
              onChange={setForm}
              onSubmit={() => void generate()}
              onCancel={latest ? () => setEditing(false) : undefined}
            />
          ) : null}

          {!editing && displayPlan && !displayView ? <p className="text-sm">该版本无法读取</p> : null}

          {!editing && displayPlan && displayView ? (
            <div data-acf-plan-workspace>
              {pendingNewDraft && draftPlan && !preferConfirmed ? (
                <section className="rounded-[var(--acf-radius-md)] border border-[var(--acf-warning)] bg-[var(--acf-warning-soft)] px-4 py-3 text-sm">
                  <p className="font-medium">有一份新的内容规划等待你确认</p>
                  <Button className="mt-3" type="button" disabled={pending} onClick={() => void confirm()}>
                    {pending ? "正在确认…" : "确认本期规划"}
                  </Button>
                  {selected.confirmed ? (
                    <button className="ml-3 text-sm underline" type="button" onClick={() => setPreferConfirmed(true)}>
                      查看当前已确认版本
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3" data-acf-plan-header>
                <p className="text-sm">
                  第{displayPlan.version}版 · {planStatusLabel(displayPlan.status)} · {displayView.topicCount}条内容
                </p>
                <LearningContextSummaryV1
                  positioning={currentPositioning?.output}
                  acceptedFeedback={acceptedFeedback}
                  publishedCount={publishedCount || undefined}
                  showIgnoreControl={regenerateAsk}
                  ignored={form.ignoreAcceptedPerformanceFeedback}
                  onToggleIgnore={(ignored) => setForm({ ...form, ignoreAcceptedPerformanceFeedback: ignored })}
                  generatedPlan={Boolean(canGenerateScript(displayPlan.status))}
                />
                {pendingConfirmMode && !pendingNewDraft ? (
                  <Button type="button" disabled={pending} onClick={() => void confirm()}>
                    {pending ? "正在确认…" : "确认内容计划"}
                  </Button>
                ) : null}
                {confirmedMode && confirmFocusHref ? (
                  <div>
                    <Link
                      className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
                      href={confirmFocusHref}
                    >
                      {nextAction.kind === "SCRIPT" ? "开始制作第一条脚本" : nextAction.label}
                    </Link>
                    <span className="sr-only">为这个选题生成脚本</span>
                  </div>
                ) : null}
                {pendingConfirmMode ? (
                  <p className="acf-caption">确认后，将进入脚本阶段。回看定位不会清空这份计划。</p>
                ) : null}
              </section>

              <section className="mt-8" data-acf-week-section>
                <h2 className="acf-section-title mb-3">本周内容</h2>
                <ContentPlanningTopics
                view={displayView}
                projectId={projectId}
                planId={displayPlan.id}
                canScript={canGenerateScript(displayPlan.status)}
                productionItems={productionItems}
                scripts={scripts}
                videos={videos}
                highlightTopicId={
                    confirmedMode && nextAction.kind === "SCRIPT" ? nextAction.topic.topicId : null
                  }
                />
              </section>

              <section className="mt-10 bg-[var(--acf-surface-muted)]" data-acf-plan-secondary>
                <details data-acf-planning-more>
                  <summary className="cursor-pointer text-sm text-[var(--acf-text-secondary)]">更多</summary>
                  <div className="mt-1 divide-y divide-[var(--acf-border-subtle)]" data-acf-planning-more-index>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          制作进度
                          <span className="acf-caption ml-2">脚本、视频与发布数量</span>
                        </span>
                        <span className="acf-caption" aria-hidden>
                          &gt;
                        </span>
                      </summary>
                      <dl className="space-y-1 pb-3 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-[var(--acf-text-secondary)]">脚本</dt>
                          <dd>
                            {progress.scriptReadyCount} / {progress.topicCount || displayView.topicCount}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[var(--acf-text-secondary)]">视频</dt>
                          <dd>
                            {progress.videoReadyCount} / {progress.topicCount || displayView.topicCount}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[var(--acf-text-secondary)]">发布</dt>
                          <dd>
                            {progress.publishedCount} / {progress.topicCount || displayView.topicCount}
                          </dd>
                        </div>
                        {progress.topicCount > 0 ? (
                          <div className="flex justify-between gap-4">
                            <dt className="text-[var(--acf-text-secondary)]">已进入制作</dt>
                            <dd>
                              {progress.enteredProductionCount} / {progress.topicCount}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {confirmedMode && confirmFocusHref ? (
                        <Link className="mb-3 inline-block text-sm text-[var(--acf-text-secondary)] underline" href={confirmFocusHref}>
                          查看脚本工作台
                        </Link>
                      ) : null}
                    </details>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          为什么这样规划
                          <span className="acf-caption ml-2">策略与计划依据</span>
                        </span>
                        <span className="acf-caption" aria-hidden>
                          &gt;
                        </span>
                      </summary>
                      <div className="space-y-2 pb-3 text-sm text-[var(--acf-text-secondary)]">
                        <p>
                          当前推广策略：
                          {planStrategy
                            ? `第${planStrategy.version}版${
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
                      </div>
                    </details>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          历史版本
                          <span className="acf-caption ml-2">只读查看</span>
                        </span>
                        <span className="acf-caption" aria-hidden>
                          &gt;
                        </span>
                      </summary>
                      <div className="pb-3">
                        <ContentPlanningHistory
                          embedded
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
                    </details>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          重新规划本周内容
                          <span className="acf-caption ml-2">生成新版本</span>
                        </span>
                        <span className="acf-caption" aria-hidden>
                          &gt;
                        </span>
                      </summary>
                      <div className="pb-3">
                        <p className="text-sm text-[var(--acf-text-secondary)]">
                          重新规划会生成新版本，不会覆盖已确认历史版本。
                        </p>
                        {!regenerateAsk ? (
                          <Button className="mt-2" variant="secondary" type="button" disabled={pending} onClick={() => setRegenerateAsk(true)}>
                            重新规划本周内容
                          </Button>
                        ) : (
                          <div className="mt-2 text-sm">
                            <p>将生成一个新版本，不会覆盖已确认的历史版本。</p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => {
                                  setRegenerateAsk(false);
                                  setEditing(true);
                                }}
                              >
                                继续重新规划
                              </Button>
                              <Button variant="ghost" type="button" onClick={() => setRegenerateAsk(false)}>
                                取消
                              </Button>
                            </div>
                          </div>
                        )}
                        {productionPlan && canArchivePlan(productionPlan.status) ? (
                          <Button className="mt-2" variant="ghost" type="button" disabled={pending} onClick={() => setArchiveAsk(true)}>
                            归档计划
                          </Button>
                        ) : null}
                        {archiveAsk ? (
                          <div className="mt-2 text-sm">
                            <p>归档后，这份计划不再作为当前生产计划使用。</p>
                            <div className="mt-2 flex gap-2">
                              <Button variant="secondary" type="button" disabled={pending} onClick={() => void archive()}>
                                确认归档
                              </Button>
                              <Button variant="ghost" type="button" onClick={() => setArchiveAsk(false)}>
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                </details>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
      <NextActionBarV1
        backHref={flow.back?.href}
        backLabel={flow.back?.label}
        currentLabel="内容计划"
        nextHref={flow.next?.href}
        nextLabel={flow.next?.label}
      />
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
