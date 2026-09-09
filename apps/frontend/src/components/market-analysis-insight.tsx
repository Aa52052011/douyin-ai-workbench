import { useState } from "react";
import type { InsightItemView, InsightView } from "../lib/market-analysis.types";
import { buildConfidenceActionView } from "../lib/confidence-action";
import { ConfidenceActionCard } from "./confidence-action-card";
import { ExplanationDetails } from "./explanation-details";
import { campaignStrategyHref } from "../lib/market-analysis.view";

function InsightItem({ item }: { item: InsightItemView }) {
  const [open, setOpen] = useState(false);
  const canTrace = item.traces.length > 0;

  return (
    <li className="min-w-0 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
      <p className="text-sm leading-6">{item.statement}</p>
      <p className="mt-2 text-xs text-neutral-500">
        {[item.confidenceLabel, item.evidenceCountLabel].filter(Boolean).join(" · ")}
      </p>
      {item.caveat ? <p className="mt-1 text-xs text-neutral-500">{item.caveat}</p> : null}
      {canTrace ? (
        <details className="mt-2" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm text-neutral-700" aria-expanded={open}>
            查看依据
          </summary>
          <ul className="mt-2 space-y-2">
            {item.traces.map((trace, index) => (
              <li key={`${item.statement}-${index}`} className="text-sm text-neutral-600">
                <p className="font-medium text-neutral-800">{trace.title}</p>
                <p>{trace.description}</p>
                <p className="text-neutral-500">{[trace.supportLabel, trace.confidenceLabel].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export function MarketAnalysisInsightSummary({
  view,
  projectId,
}: {
  view: InsightView;
  projectId?: string;
}) {
  const confidence = projectId
    ? buildConfidenceActionView({
        confidence: view.rawConfidence,
        limitationCodes: view.rawLimitationCodes,
        projectId,
        context: "market",
      })
    : null;

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      {view.executiveSummary ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">总结</h2>
          <p className="text-sm leading-6">{view.executiveSummary}</p>
        </section>
      ) : null}

      {confidence ? (
        <ConfidenceActionCard
          view={confidence}
          continueLabel="继续做推广策略"
          continueHref={projectId ? campaignStrategyHref(projectId) : undefined}
        />
      ) : null}

      {view.sections.map((section) => (
        <section key={section.heading} className="border-t border-neutral-200 pt-4">
          <h2 className="mb-3 text-sm font-medium">{section.heading}</h2>
          <ul className="space-y-3">
            {section.items.map((item, index) => (
              <InsightItem key={`${section.heading}-${index}`} item={item} />
            ))}
          </ul>
        </section>
      ))}

      <ExplanationDetails summary="为什么这样判断">
        {view.marketStateLabel ? <p>样本状态：{view.marketStateLabel}</p> : null}
        {view.dataLimitations.length > 0 ? (
          <div>
            <p className="text-neutral-500">数据限制（说明）</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {view.dataLimitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>本轮结论基于当前已确认的市场调研样本与产品信息。</p>
        )}
        {view.confidenceNote ? <p className="text-neutral-600">{view.confidenceNote}</p> : null}
      </ExplanationDetails>
    </div>
  );
}
