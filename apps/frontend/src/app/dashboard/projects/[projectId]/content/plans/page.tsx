"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ContentPlanningForm } from "../../../../../../components/content-planning-form";
import { ContentPlanningHistory } from "../../../../../../components/content-planning-history";
import { ContentPlanningTopics } from "../../../../../../components/content-planning-topics";
import { EmptyState } from "../../../../../../components/empty-state";
import { PageHeader } from "../../../../../../components/page-header";
import { useAuth } from "../../../../../../lib/auth-context";
import { listCampaignStrategies } from "../../../../../../lib/campaign-strategy.api";
import type { CampaignStrategyRecord } from "../../../../../../lib/campaign-strategy.types";
import {
  defaultPositioningRunId,
  formatStrategyTime,
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
  expectedTopicCount,
  humanizePlanningError,
  latestPlan,
  positioningHref,
  resolveStrategyQuery,
  usableStrategies,
} from "../../../../../../lib/content-planning.form";
import type { ContentPlanRecord, PlanningFormState } from "../../../../../../lib/content-planning.types";
import { parsedPlanView, planHistoryViews } from "../../../../../../lib/content-planning.view";
import { listPositioningRuns } from "../../../../../../lib/positioning.api";
import { completedPositioningRecords } from "../../../../../../lib/positioning.form";
import type { PositioningRecord } from "../../../../../../lib/positioning.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";

function ContentPlansPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryStrategyId = searchParams.get("strategyId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [positioning, setPositioning] = useState<PositioningRecord[]>([]);
  const [strategies, setStrategies] = useState<CampaignStrategyRecord[]>([]);
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [form, setForm] = useState<PlanningFormState>(emptyPlanningForm(project.platform || "douyin"));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [strategyByPlanId, setStrategyByPlanId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listPositioningRuns(accessToken, projectId),
      listCampaignStrategies(accessToken, projectId),
      listContentPlans(accessToken, projectId),
    ]).then(([positioningResult, strategyResult, planResult]) => {
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
  const latestView = latest ? parsedPlanView(latest) : null;
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
  const currentStrategyLabel = latest ? strategyByPlanId[latest.id] : undefined;

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
    } catch (error) {
      setActionError(humanizePlanningError(error, "generate"));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!accessToken || !latest || pending || !canConfirmPlan(latest.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await confirmContentPlan(accessToken, latest.id);
      setPlans(await listContentPlans(accessToken, projectId));
    } catch (error) {
      setActionError(humanizePlanningError(error, "confirm"));
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!accessToken || !latest || pending || !canArchivePlan(latest.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await archiveContentPlan(accessToken, latest.id);
      setPlans(await listContentPlans(accessToken, projectId));
      setArchiveAsk(false);
    } catch (error) {
      setActionError(humanizePlanningError(error, "archive"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="内容计划"
        description="根据账号定位和推广策略，生成接下来一段时间的内容选题和发布方向。"
        breadcrumb={`项目 / ${project.name} / 内容计划`}
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
          description="先生成账号定位，才能创建内容计划。"
          primaryAction={{ label: "去生成账号定位", href: positioningHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && positioning.length > 0 ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <h2 className="mb-2 text-sm font-medium">本次计划依据</h2>
            <p>账号定位：{positioning.find((item) => item.runId === form.positioningRunId)?.output.accountPositioning ?? "请选择"}</p>
            <p>推广策略：{form.strategyId ? `版本 ${selectedStrategy?.version ?? ""}` : "未使用"}</p>
            <p>计划周期：{form.planningDays} 天</p>
            <p>每天数量：{form.postsPerDay} 条</p>
            <p>补充要求：{form.additionalRequirements.trim() || "未填写"}</p>
          </section>

          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}

          {pending && editing ? (
            <p className="text-sm text-neutral-700" aria-live="polite">
              AI 正在生成内容计划… 预计生成 {expectedTopicCount(form.planningDays, form.postsPerDay)} 个选题
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-red-600" role="alert">
              {actionError}
            </p>
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
              onChange={setForm}
              onSubmit={() => void generate()}
              onCancel={latest ? () => setEditing(false) : undefined}
            />
          ) : null}

          {!editing && latest && !latestView ? <p className="text-sm text-neutral-600">该版本无法读取</p> : null}

          {!editing && latest && latestView ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {canConfirmPlan(latest.status) ? (
                  <button
                    className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                    type="button"
                    disabled={pending}
                    onClick={() => void confirm()}
                  >
                    确认计划
                  </button>
                ) : null}
                <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={() => setEditing(true)}>
                  重新生成
                </button>
                {canArchivePlan(latest.status) ? (
                  <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={() => setArchiveAsk(true)}>
                    归档计划
                  </button>
                ) : null}
              </div>
              {canConfirmPlan(latest.status) ? (
                <p className="text-sm text-neutral-600">确认后，可以从选题生成脚本。</p>
              ) : null}
              {latest.status === "CONFIRMED" ? (
                <p className="text-sm text-neutral-600">从下面选择一个选题生成脚本。</p>
              ) : null}
              {archiveAsk ? (
                <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
                  <p>归档后，这份计划不再作为当前生产计划使用。</p>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-md bg-neutral-950 px-3 py-1.5 text-white" type="button" disabled={pending} onClick={() => void archive()}>
                      确认归档
                    </button>
                    <button className="rounded-md border px-3 py-1.5" type="button" onClick={() => setArchiveAsk(false)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              <ContentPlanningTopics
                view={latestView}
                projectId={projectId}
                planId={latest.id}
                canScript={canGenerateScript(latest.status)}
                strategyLabel={currentStrategyLabel}
                archived={latest.status === "ARCHIVED"}
              />
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
