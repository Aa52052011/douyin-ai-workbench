"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CampaignStrategyForm } from "../../../../../components/campaign-strategy-form";
import { CampaignStrategyHistory } from "../../../../../components/campaign-strategy-history";
import { CampaignStrategySummary } from "../../../../../components/campaign-strategy-summary";
import { EmptyState } from "../../../../../components/empty-state";
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
          <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <h2 className="mb-2 text-sm font-medium">本次策略依据</h2>
            <p>产品信息：{brief?.payload.productName ?? "已填写"}{brief?.version ? ` · 版本 ${brief.version}` : ""}</p>
            <p>账号定位：{positioning[0]?.output.accountPositioning ?? "已完成"}</p>
            <p>市场分析：{form.marketInsightId ? "将使用所选市场分析" : "未使用"}</p>
            <p>本次目标：{form.userGoal.trim() || "未填写"}</p>
          </section>

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
              <div className="flex flex-wrap gap-2">
                {planningReady ? (
                  <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={contentPlansHref(projectId, latest.id)}>
                    用于内容计划
                  </Link>
                ) : null}
                <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={openRegenerate}>
                  重新生成策略
                </button>
              </div>
              {latest.status === "ARCHIVED" ? (
                <p className="text-sm text-neutral-600">这份策略已归档，不能用于内容计划。</p>
              ) : null}
              <CampaignStrategySummary view={latestView} archived={latest.status === "ARCHIVED"} />
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
