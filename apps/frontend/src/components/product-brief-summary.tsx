import type { ReactNode } from "react";
import { formatBusinessGoalDetail, formatBusinessGoalDisplay, normalizeBusinessGoal } from "../lib/business-goal";
import { PRODUCT_BRIEF_FIELD_LABELS, type ProductBriefPayload } from "../lib/product-brief.types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="grid gap-1 py-1 sm:grid-cols-[8rem_1fr]">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{value}</dd>
    </div>
  );
}

function Chips({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) {
    return null;
  }
  return (
    <div className="grid gap-1 py-1 sm:grid-cols-[8rem_1fr]">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="max-w-full break-all rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </dd>
    </div>
  );
}

export function ProductBriefSummary({ payload }: { payload: ProductBriefPayload }) {
  const overview =
    payload.productName || payload.brand || payload.industry || payload.category || payload.description;
  const goals = payload.businessGoal || payload.conversionGoal || payload.priceRange;
  const selling = Boolean(payload.sellingPoints?.length);
  const audience = Boolean(payload.targetAudience);
  const market = Boolean(payload.seedKeywords?.length || payload.referenceCompetitors?.length);
  const style = Boolean(payload.tone || payload.constraints?.length);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      {overview ? (
        <Section title="产品概览">
          <dl>
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.productName} value={payload.productName} />
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.brand} value={payload.brand} />
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.industry} value={payload.industry} />
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.category} value={payload.category} />
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.description} value={payload.description} />
          </dl>
        </Section>
      ) : null}
      {goals ? (
        <Section title="推广目标">
          <dl>
            {payload.businessGoal ? (
              <div className="grid gap-1 py-1 sm:grid-cols-[8rem_1fr]">
                <dt className="text-sm text-neutral-500">{PRODUCT_BRIEF_FIELD_LABELS.businessGoal}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">
                  {(() => {
                    const goal = normalizeBusinessGoal({
                      businessGoal: payload.businessGoal,
                      goalCode: payload.goalCode,
                    });
                    const detail = formatBusinessGoalDetail(goal);
                    return (
                      <>
                        <p>{formatBusinessGoalDisplay(goal)}</p>
                        {detail ? <p className="mt-1 text-neutral-600">{detail}</p> : null}
                      </>
                    );
                  })()}
                </dd>
              </div>
            ) : null}
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.conversionGoal} value={payload.conversionGoal} />
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.priceRange} value={payload.priceRange} />
          </dl>
        </Section>
      ) : null}
      {selling ? (
        <Section title="核心卖点">
          <dl>
            <Chips label={PRODUCT_BRIEF_FIELD_LABELS.sellingPoints} items={payload.sellingPoints} />
          </dl>
        </Section>
      ) : null}
      {audience ? (
        <Section title="目标人群">
          <dl>
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.targetAudience} value={payload.targetAudience} />
          </dl>
        </Section>
      ) : null}
      {market ? (
        <Section title="内容与市场输入">
          <dl>
            <Chips label={PRODUCT_BRIEF_FIELD_LABELS.seedKeywords} items={payload.seedKeywords} />
            <Chips label={PRODUCT_BRIEF_FIELD_LABELS.referenceCompetitors} items={payload.referenceCompetitors} />
          </dl>
        </Section>
      ) : null}
      {style ? (
        <Section title="风格与限制">
          <dl>
            <Row label={PRODUCT_BRIEF_FIELD_LABELS.tone} value={payload.tone} />
            <Chips label={PRODUCT_BRIEF_FIELD_LABELS.constraints} items={payload.constraints} />
          </dl>
        </Section>
      ) : null}
    </div>
  );
}
