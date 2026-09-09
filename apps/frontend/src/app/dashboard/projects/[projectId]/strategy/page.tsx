"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CampaignStrategyForm } from "../../../../../components/campaign-strategy-form";
import { CampaignStrategyHistory } from "../../../../../components/campaign-strategy-history";
import { CampaignStrategySummary } from "../../../../../components/campaign-strategy-summary";
import { ConfidenceActionCard } from "../../../../../components/confidence-action-card";
import { EmptyState } from "../../../../../components/empty-state";
import { ExplanationDetails } from "../../../../../components/explanation-details";
import { PageHeader } from "../../../../../components/page-header";
import { useAuth } from "../../../../../lib/auth-context";
import { generateCampaignStrategy, listCampaignStrategies } from "../../../../../lib/campaign-strategy.api";
import {
  canGenerateStrategy,
  contentPlansHref,
  formFromContext,
  humanizeStrategyError,
  isStrategyUsable,
  latestStrategy,
  missingDependencyState,
  nextStrategyIdempotencyKey,
  positioningHref,
  productInformationHref,
  strategyGenerateSemantics,
} from "../../../../../lib/campaign-strategy.form";
import type { CampaignStrategyRecord, StrategyFormState } from "../../../../../lib/campaign-strategy.types";
import {
  defaultPositioningRunId,
  insightOptions,
  parsedStrategyView,
  positioningOptions,
  strategyHistoryViews,
} from "../../../../../lib/campaign-strategy.view";
import { buildConfidenceActionView } from "../../../../../lib/confidence-action";
import { listMarketInsights } from "../../../../../lib/market-analysis.api";
import type { MarketInsightRecord } from "../../../../../lib/market-analysis.types";
import { listMarketResearch } from "../../../../../lib/market-research.api";
import { sortResearchNewestFirst } from "../../../../../lib/market-research.form";
import type { MarketResearchRecord } from "../../../../../lib/market-research.types";
import { getCurrentProductBrief } from "../../../../../lib/product-brief.api";
import type { ProductBriefRecord } from "../../../../../lib/product-brief.types";
import { listPositioningRuns } from "../../../../../lib/positioning.api";
import { completedPositioningRecords } from "../../../../../lib/positioning.form";
import type { PositioningRecord } from "../../../../../lib/positioning.types";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";

export default function CampaignStrategyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [brief, setBrief] = useState<ProductBriefRecord | null>(null);
  const [positioning, setPositioning] = useState<PositioningRecord[]>([]);
  const [researches, setResearches] = useState<MarketResearchRecord[]>([]);
  const [insights, setInsights] = useState<MarketInsightRecord[]>([]);
  const [strategies, setStrategies] = useState<CampaignStrategyRecord[]>([]);
  const [form, setForm] = useState<StrategyFormState>(formFromContext({}));
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [idempotency, setIdempotency] = useState<{ semantics: string; key: string } | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      getCurrentProductBrief(accessToken, projectId),
      listPositioningRuns(accessToken, projectId),
      listMarketResearch(accessToken, projectId),
      listCampaignStrategies(accessToken, projectId),
    ]).then(([briefResult, positioningResult, researchResult, strategyResult]) => {
      if (cancelled) {
        return;
      }
      if (briefResult.status === "rejected" || positioningResult.status === "rejected" || researchResult.status === "rejected") {
        setLoadError("无法加载推广策略所需信息，请刷新重试。");
        setLoading(false);
        return;
      }
      const nextBrief = briefResult.value;
      const nextPositioning = completedPositioningRecords(positioningResult.value);
      const nextResearch = sortResearchNewestFirst(researchResult.value);
      setBrief(nextBrief);
      setPositioning(nextPositioning);
      setResearches(nextResearch);
      if (strategyResult.status === "fulfilled") {
        setStrategies(strategyResult.value);
        setStrategyError(null);
      } else {
        setStrategies([]);
        setStrategyError("无法加载推广策略。");
      }
      const latest = strategyResult.status === "fulfilled" ? latestStrategy(strategyResult.value) : null;
      setForm(
        formFromContext({
          positioningRunId: latest?.positioningRunId || defaultPositioningRunId(nextPositioning),
          marketResearchId: latest?.marketResearchId ?? nextResearch[0]?.id ?? "",
          marketInsightId: latest?.marketInsightId ?? "",
          snapshot: latest?.inputSnapshot,
        }),
      );
      setEditing(false);
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  useEffect(() => {
    if (!accessToken || !form.marketResearchId) {
      return;
    }
    let cancelled = false;
    void listMarketInsights(accessToken, form.marketResearchId)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setInsights(rows);
        setForm((current) => {
          if (!current.marketResearchId) {
            return current;
          }
          if (current.marketInsightId && rows.some((item) => item.id === current.marketInsightId)) {
            return current;
          }
          return { ...current, marketInsightId: rows[0]?.id ?? "" };
        });
      })
      .catch(() => {
        if (!cancelled) {
          setInsights([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, form.marketResearchId]);

  const latest = latestStrategy(strategies);
  const latestView = latest ? parsedStrategyView(latest) : null;
  const planningReady = Boolean(latest && latestView && isStrategyUsable(latest.status));
  const strategyConfidence =
    latestView && projectId
      ? buildConfidenceActionView({
          confidence: latestView.rawConfidence,
          limitationCodes: latestView.rawLimitationCodes,
          projectId,
          context: "strategy",
        })
      : null;
  const missing = missingDependencyState({ briefExists: Boolean(brief), hasPositioning: positioning.length > 0 });
  const noMarketHint = !form.marketInsightId;
  const researchOptions = [...researches]
    .sort((a, b) => a.version - b.version)
    .map((item) => ({ id: item.id, label: `第 ${item.version} 次调研` }));

  async function generate() {
    if (!accessToken || !projectId || pending || !canGenerateStrategy({ briefExists: Boolean(brief), positioningRunId: form.positioningRunId })) {
      return;
    }
    const nextKey = nextStrategyIdempotencyKey(idempotency, strategyGenerateSemantics(form));
    setIdempotency(nextKey);
    setPending(true);
    setGenerateError(null);
    try {
      await generateCampaignStrategy(accessToken, projectId, form, {
        productBriefId: brief?.id,
        idempotencyKey: nextKey.key,
      });
      const rows = await listCampaignStrategies(accessToken, projectId);
      setStrategies(rows);
      setEditing(false);
    } catch (error) {
      setGenerateError(humanizeStrategyError(error));
    } finally {
      setPending(false);
    }
  }

  function openRegenerate() {
    setForm(
      formFromContext({
        positioningRunId: latest?.positioningRunId || defaultPositioningRunId(positioning),
        marketResearchId: latest?.marketResearchId ?? researches[0]?.id ?? "",
        marketInsightId: latest?.marketInsightId ?? "",
        snapshot: latest?.inputSnapshot,
      }),
    );
    setIdempotency(null);
    setGenerateError(null);
    setEditing(true);
  }

  return (
    <div>
      <PageHeader
        title="推广策略"
        description="基于产品信息、账号定位和市场分析，生成一套可执行的内容推广方向，作为后续内容计划的策略基线。"
        breadcrumb={`项目 / ${project.name} / 推广策略`}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载推广策略…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && strategyError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {strategyError}
        </p>
      ) : null}

      {!loading && !loadError && missing === "both" ? (
        <EmptyState
          title="还不能生成推广策略"
          description="先填写产品信息并生成账号定位，才能开始做推广策略。"
          primaryAction={{ label: "去填写产品信息", href: productInformationHref(projectId) }}
          secondaryAction={{ label: "去生成账号定位", href: positioningHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && missing === "brief" ? (
        <EmptyState
          title="还没有产品信息"
          description="先填写你要推广的产品，策略才能对得上目标。"
          primaryAction={{ label: "去填写产品信息", href: productInformationHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && missing === "positioning" ? (
        <EmptyState
          title="还没有账号定位"
          description="推广策略需要先有一份完成的账号定位。"
          primaryAction={{ label: "去生成账号定位", href: positioningHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && !missing ? (
        <div className="space-y-6">
          {pending ? (
            <p className="text-sm text-neutral-700" aria-live="polite">
              AI 正在生成推广策略…
            </p>
          ) : null}
          {generateError ? (
            <p className="text-sm text-red-600" role="alert">
              {generateError}
            </p>
          ) : null}

          {!latest && !editing ? (
            <EmptyState
              title="还没有推广策略"
              description="基于产品信息、账号定位和市场分析，生成一套后续内容计划可以直接使用的推广方向。"
              primaryAction={{ label: "生成推广策略", onClick: () => setEditing(true) }}
            />
          ) : null}

          {editing ? (
            <CampaignStrategyForm
              projectId={projectId}
              form={form}
              positioningOptions={positioningOptions(positioning)}
              researchOptions={researchOptions}
              insightOptions={insightOptions(researches, insights)}
              pending={pending}
              noMarketHint={noMarketHint}
              onChange={setForm}
              onSubmit={() => void generate()}
              onCancel={latest ? () => setEditing(false) : undefined}
            />
          ) : null}

          {!editing && latest && !latestView ? (
            <p className="text-sm text-neutral-600">该版本无法读取</p>
          ) : null}

          {!editing && latest && latestView ? (
            <div className="space-y-4">
              <CampaignStrategySummary view={latestView} archived={latest.status === "ARCHIVED"} />

              {strategyConfidence ? (
                <ConfidenceActionCard
                  view={strategyConfidence}
                  continueLabel={planningReady ? "用于生成内容计划" : undefined}
                  continueHref={planningReady ? contentPlansHref(projectId, latest.id) : undefined}
                />
              ) : null}

              <ExplanationDetails summary="为什么这样建议">
                <p>
                  基于你的产品信息：
                  {brief?.payload.productName
                    ? `「${brief.payload.productName}${
                        brief.payload.targetAudience ? `面向${brief.payload.targetAudience}` : ""
                      }${brief.payload.businessGoal ? `，希望${brief.payload.businessGoal}` : ""}」。`
                    : "已确认的产品信息。"}
                </p>
                <p>
                  结合账号定位：
                  {positioning[0]?.output.accountPositioning
                    ? `「${positioning[0].output.accountPositioning}」。`
                    : "已完成的账号定位。"}
                </p>
                <p>
                  结合市场调研：
                  {form.marketInsightId
                    ? latestView.dataLimitations.length > 0
                      ? `当前样本有限（${latestView.dataLimitations.slice(0, 2).join("；")}），因此策略偏向验证型打法。`
                      : "已结合所选市场分析。"
                    : "未使用市场分析，策略更偏产品与定位驱动的验证型打法。"}
                </p>
                {form.userGoal.trim() ? <p>本次目标：{form.userGoal.trim()}</p> : null}
                {latestView.confidenceLabel ? (
                  <p className="text-neutral-600">
                    {latestView.confidenceLabel}。{latestView.confidenceNote}
                  </p>
                ) : null}
              </ExplanationDetails>

              <div className="flex flex-wrap items-center gap-3">
                {planningReady ? (
                  <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={contentPlansHref(projectId, latest.id)}>
                    用于生成内容计划
                  </Link>
                ) : null}
                <button
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
                  type="button"
                  disabled={pending}
                  onClick={openRegenerate}
                  title="重新生成策略会重新制定本轮推广方向，可能影响后续内容计划。"
                >
                  重新生成策略
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                重新生成策略会重新制定本轮推广方向，可能影响后续内容计划。不会因为重新生成计划/脚本/视频而自动重跑策略。
              </p>
              {latest.status === "ARCHIVED" ? (
                <p className="text-sm text-neutral-600">这份策略已归档，不能用于内容计划。</p>
              ) : null}
            </div>
          ) : null}

          <CampaignStrategyHistory
            items={strategyHistoryViews(strategies)}
            resolveView={(version) => {
              const record = strategies.find((item) => item.version === version);
              if (!record) {
                return null;
              }
              return { record, view: parsedStrategyView(record) };
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
