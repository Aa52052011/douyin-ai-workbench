import { NO_CAUSAL_COPY, type ObservationCardModel } from "../lib/ai-review.workspace";

export function ObservationCardV2({ item }: { item: ObservationCardModel }) {
  return (
    <article className="space-y-2 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4" data-acf-observation-card-v2>
      <h3 className="acf-section-title">{item.title}</h3>
      <p className="text-base font-medium text-[var(--acf-text)]">{item.fact}</p>
      {item.interpretation ? <p className="text-sm">{item.interpretation}</p> : null}
      <details className="text-sm" data-acf-observation-limits>
        <summary className="cursor-pointer">查看解释与限制</summary>
        <div className="mt-2 space-y-1">
          {item.interpretation ? (
            <p className="acf-body">
              <span className="acf-caption mr-2">AI解释</span>
              {item.interpretation}
            </p>
          ) : null}
          <p className="acf-caption">不确定性：{item.uncertainty || NO_CAUSAL_COPY}</p>
        </div>
      </details>
    </article>
  );
}
