import type { ResearchSummaryView } from "../lib/market-analysis.types";

export function MarketAnalysisResearchSummary({
  summary,
  frozenBriefNote,
}: {
  summary: ResearchSummaryView;
  frozenBriefNote: string;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-medium">当前调研</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">调研轮次</dt>
          <dd>{summary.ordinalLabel}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">产品信息</dt>
          <dd>{summary.productBriefVersionLabel}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">样本数量</dt>
          <dd>{summary.sampleCount} 条</dd>
        </div>
        <div>
          <dt className="text-neutral-500">数据类型</dt>
          <dd>{summary.kindLabel}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">来源</dt>
          <dd>{summary.sourceLabel}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">数据质量</dt>
          <dd>{summary.qualityLabel || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-neutral-500">创建时间</dt>
          <dd>{summary.createdAtLabel || "—"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-neutral-600">{summary.sampleScopeNote}</p>
      <p className="mt-1 text-sm text-neutral-600">{frozenBriefNote}</p>
    </section>
  );
}
