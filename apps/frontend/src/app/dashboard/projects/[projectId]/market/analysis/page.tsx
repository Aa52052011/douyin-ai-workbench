"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketAnalysisEvidenceFold, MarketAnalysisEvidenceSummary } from "../../../../../../components/market-analysis-evidence";
import { MarketAnalysisHistory } from "../../../../../../components/market-analysis-history";
import { MarketAnalysisInsightSummary } from "../../../../../../components/market-analysis-insight";
import { MarketAnalysisResearchSelector } from "../../../../../../components/market-analysis-research-selector";
import { MarketAnalysisResearchSummary } from "../../../../../../components/market-analysis-research-summary";
import { EmptyState } from "../../../../../../components/empty-state";
import { PageHeader } from "../../../../../../components/page-header";
import { useAuth } from "../../../../../../lib/auth-context";
import { createMarketInsight, getMarketEvidence, listMarketInsights } from "../../../../../../lib/market-analysis.api";
import type { MarketEvidenceRecord, MarketInsightRecord } from "../../../../../../lib/market-analysis.types";
import {
  campaignStrategyHref,
  defaultSelectedResearchId,
  evidenceCatalog,
  evidenceGroupsView,
  evidenceSummaryView,
  frozenBriefNote,
  historyItemViews,
  humanizeMarketAnalysisError,
  insightView,
  latestInsight,
  marketResearchHref,
  noneGenerateNote,
  researchQualityWarning,
  researchSelectorOptions,
  selectedResearchBindings,
  selectedResearchSummary,
  trimUserFocus,
} from "../../../../../../lib/market-analysis.view";
import { listMarketResearch } from "../../../../../../lib/market-research.api";
import { sortResearchNewestFirst } from "../../../../../../lib/market-research.form";
import type { MarketResearchRecord } from "../../../../../../lib/market-research.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";

export default function MarketAnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [researches, setResearches] = useState<MarketResearchRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedResearchId, setLoadedResearchId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<MarketEvidenceRecord | null>(null);
  const [insights, setInsights] = useState<MarketInsightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [userFocus, setUserFocus] = useState("");

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void listMarketResearch(accessToken, projectId)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const sorted = sortResearchNewestFirst(rows);
        setResearches(sorted);
        setSelectedId((current) => current && sorted.some((item) => item.id === current) ? current : defaultSelectedResearchId(sorted));
        setLoadError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoadError("无法加载市场调研，请刷新重试。");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  useEffect(() => {
    if (!accessToken || !selectedId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([getMarketEvidence(accessToken, selectedId), listMarketInsights(accessToken, selectedId)]).then(
      ([evidenceResult, insightResult]) => {
        if (cancelled) {
          return;
        }
        if (evidenceResult.status === "fulfilled") {
          setEvidence(evidenceResult.value);
          setEvidenceError(null);
        } else {
          setEvidence(null);
          setEvidenceError("无法加载分析依据。");
        }
        if (insightResult.status === "fulfilled") {
          setInsights(insightResult.value);
          setInsightError(null);
        } else {
          setInsights([]);
          setInsightError("无法加载市场分析结果。");
        }
        setLoadedResearchId(selectedId);
        setGenerateError(null);
        setUserFocus("");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId]);

  const selected = researches.find((item) => item.id === selectedId) ?? null;
  const bound = selectedResearchBindings({
    selectedId,
    loadedResearchId,
    evidence,
    insights,
  });
  const catalog = evidenceCatalog(bound.evidence);
  const currentInsight = latestInsight(bound.insights);
  const currentView = currentInsight ? insightView(currentInsight.payload, catalog) : null;
  const sufficiency = bound.evidence?.dataSufficiency ?? selected?.snapshot?.dataQuality?.dataSufficiency;
  const qualityWarning = researchQualityWarning(sufficiency);
  const noneNote = noneGenerateNote(sufficiency);
  const detailLoading = Boolean(selectedId) && selectedId !== loadedResearchId;

  async function generate() {
    if (!accessToken || !selectedId || pending) {
      return;
    }
    setPending(true);
    setGenerateError(null);
    try {
      await createMarketInsight(accessToken, selectedId, { userFocus: trimUserFocus(userFocus) });
      const rows = await listMarketInsights(accessToken, selectedId);
      setInsights(rows);
      setLoadedResearchId(selectedId);
    } catch (error) {
      setGenerateError(humanizeMarketAnalysisError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="市场分析"
        description="基于你导入的市场样本，整理关键词、内容、竞品和用户信号，帮助你判断当前样本里值得关注的方向。"
        breadcrumb={`项目 / ${project.name} / 市场分析`}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载市场分析…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && researches.length === 0 ? (
        <EmptyState
          title="还没有市场调研"
          description="先导入一批市场样本，才能开始市场分析。"
          primaryAction={{ label: "去导入市场数据", href: marketResearchHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && selected ? (
        <div className="space-y-6">
          <MarketAnalysisResearchSelector
            options={researchSelectorOptions(researches)}
            value={selected.id}
            disabled={pending}
            onChange={setSelectedId}
          />
          <MarketAnalysisResearchSummary summary={selectedResearchSummary(selected)} frozenBriefNote={frozenBriefNote(selected)} />

          {sufficiency === "LIMITED" || sufficiency === "NONE" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {qualityWarning ??
                "目前市场信息较少，本轮分析会更多依赖你的产品信息和已确认的研究方向，结论可信度会相对较低。"}
            </p>
          ) : null}

          {detailLoading ? (
            <p className="text-sm text-neutral-600" aria-live="polite">
              正在加载市场分析…
            </p>
          ) : null}

          {!detailLoading && bound.evidence ? <MarketAnalysisEvidenceSummary summary={evidenceSummaryView(bound.evidence)} /> : null}
          {!detailLoading && evidenceError ? (
            <p className="text-sm text-neutral-500" role="status">
              {evidenceError}
            </p>
          ) : null}
          {!detailLoading && insightError ? (
            <p className="text-sm text-red-600" role="alert">
              {insightError}
            </p>
          ) : null}

          {pending ? (
            <p className="text-sm text-neutral-700" aria-live="polite">
              AI 正在分析当前市场样本…
            </p>
          ) : null}
          {generateError ? (
            <p className="text-sm text-red-600" role="alert">
              {generateError}
            </p>
          ) : null}

          {!detailLoading && currentView ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={campaignStrategyHref(projectId)}>
                  下一步：生成推广策略
                </Link>
                <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={() => void generate()}>
                  重新分析
                </button>
              </div>
              {qualityWarning && (sufficiency === "LIMITED" || sufficiency === "NONE") ? (
                <p className="text-sm text-neutral-600">{qualityWarning}</p>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">本次特别想关注什么？（可选）</span>
                <input
                  className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  maxLength={500}
                  value={userFocus}
                  disabled={pending}
                  onChange={(event) => setUserFocus(event.target.value)}
                  placeholder="例如：竞品内容方向、关键词机会、用户需求"
                />
              </label>
              <MarketAnalysisInsightSummary view={currentView} projectId={projectId} />
            </div>
          ) : null}

          {!detailLoading && !currentView && !insightError ? (
            <div className="space-y-4">
              <EmptyState
                title="这份调研还没有市场分析"
                description="AI 会基于当前样本和分析依据整理市场信号。"
              />
              {qualityWarning ? <p className="text-sm text-neutral-600">{qualityWarning}</p> : null}
              {noneNote ? <p className="text-sm text-neutral-600">{noneNote}</p> : null}
              <label className="block text-sm">
                <span className="mb-1 block text-neutral-600">本次特别想关注什么？（可选）</span>
                <input
                  className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  maxLength={500}
                  value={userFocus}
                  disabled={pending}
                  onChange={(event) => setUserFocus(event.target.value)}
                  placeholder="例如：竞品内容方向、关键词机会、用户需求"
                />
              </label>
              <button
                className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                type="button"
                disabled={pending}
                onClick={() => void generate()}
              >
                开始市场分析
              </button>
            </div>
          ) : null}

          {!detailLoading ? (
            <MarketAnalysisEvidenceFold groups={bound.evidence ? evidenceGroupsView(bound.evidence) : []} unavailable={Boolean(evidenceError)} />
          ) : null}

          {!detailLoading ? (
            <MarketAnalysisHistory
              items={historyItemViews(bound.insights)}
              resolveView={(version) => {
                const record = bound.insights.find((item) => item.version === version);
                if (!record) {
                  return null;
                }
                const view = insightView(record.payload, catalog);
                return view ? { record, view } : null;
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
