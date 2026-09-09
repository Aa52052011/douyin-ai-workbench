import type { ReactNode } from "react";
import type { ContentMixItemView, StrategyItemView, StrategyView } from "../lib/campaign-strategy.types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="space-y-2 text-sm leading-6">{children}</div>
    </section>
  );
}

function ItemList({ items }: { items: StrategyItemView[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`} className="min-w-0 rounded-lg bg-neutral-50 px-3 py-2">
          <p className="font-medium">
            {item.title}
            {item.priorityLabel ? <span className="ml-2 text-xs font-normal text-neutral-500">{item.priorityLabel}</span> : null}
          </p>
          {item.detail ? <p className="mt-1 text-neutral-600">{item.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function MixList({ items }: { items: ContentMixItemView[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.type} className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{item.type}</p>
            {item.percentage !== undefined ? <p className="text-neutral-500">{item.percentage}%</p> : null}
          </div>
          {item.percentage !== undefined ? (
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-neutral-800" style={{ width: `${Math.max(0, Math.min(item.percentage, 100))}%` }} />
            </div>
          ) : null}
          <p className="mt-1 text-neutral-600">{item.purpose}</p>
        </li>
      ))}
    </ul>
  );
}

/** L1 default strategy result — no raw evidence pills, no top-level limitation/confidence blocks. */
export function CampaignStrategySummary({ view, archived }: { view: StrategyView; archived?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      {archived ? <p className="mb-3 text-sm text-neutral-600">已归档</p> : null}

      {view.objective ? (
        <Section title="推广目标">
          <p>{view.objective.primaryObjective}</p>
          <p className="text-neutral-600">业务目标：{view.objective.businessGoal}</p>
          {view.objective.conversionGoal ? <p className="text-neutral-600">转化目标：{view.objective.conversionGoal}</p> : null}
        </Section>
      ) : null}

      {view.positioning ? (
        <Section title="推荐策略 / 推广定位">
          <p>{view.positioning.accountRole}</p>
          <p className="text-neutral-600">{view.positioning.marketPosition}</p>
          {view.positioning.differentiation.length > 0 ? (
            <p>差异点：{view.positioning.differentiation.join("、")}</p>
          ) : null}
        </Section>
      ) : null}

      {view.targetAudience ? (
        <Section title="目标受众">
          <p>核心人群：{view.targetAudience.primary}</p>
          {view.targetAudience.secondary ? <p>次要人群：{view.targetAudience.secondary}</p> : null}
          {view.targetAudience.pains.length > 0 ? <p>痛点：{view.targetAudience.pains.join("、")}</p> : null}
          {view.targetAudience.motivations.length > 0 ? (
            <p>动机：{view.targetAudience.motivations.join("、")}</p>
          ) : null}
        </Section>
      ) : null}

      {view.contentPillars.length > 0 ? (
        <Section title="内容方向">
          <ItemList items={view.contentPillars} />
        </Section>
      ) : null}

      {view.valuePropositions.length > 0 ? (
        <Section title="核心价值主张">
          <ItemList items={view.valuePropositions} />
        </Section>
      ) : null}

      {view.contentMix.length > 0 ? (
        <Section title="内容组合">
          <MixList items={view.contentMix} />
        </Section>
      ) : null}

      {view.creativeAngles.length > 0 ? (
        <Section title="创意角度">
          <ItemList items={view.creativeAngles} />
        </Section>
      ) : null}

      {view.conversionPath ? (
        <Section title="关键执行建议">
          <p>认知：{view.conversionPath.awareness}</p>
          <p>考虑：{view.conversionPath.consideration}</p>
          <p>转化：{view.conversionPath.conversion}</p>
          {view.ctaStrategy && view.ctaStrategy.principles.length > 0 ? (
            <p>CTA 原则：{view.ctaStrategy.principles.join("、")}</p>
          ) : null}
          {view.publishingCadence ? <p>发布节奏：{view.publishingCadence}</p> : null}
        </Section>
      ) : null}

      {view.testingStrategy &&
      (view.testingStrategy.hypotheses.length > 0 ||
        view.testingStrategy.variables.length > 0 ||
        view.testingStrategy.successSignals.length > 0) ? (
        <Section title="验证与测试">
          {view.testingStrategy.hypotheses.length > 0 ? (
            <div>
              <p className="text-neutral-500">待验证假设</p>
              <ul className="list-disc pl-5">
                {view.testingStrategy.hypotheses.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {view.testingStrategy.variables.length > 0 ? <p>测试变量：{view.testingStrategy.variables.join("、")}</p> : null}
          {view.testingStrategy.successSignals.length > 0 ? (
            <p>观察什么：{view.testingStrategy.successSignals.join("、")}</p>
          ) : null}
        </Section>
      ) : null}

      {view.risks.length > 0 ? (
        <Section title="风险与注意事项">
          <ul className="list-disc space-y-1 pl-5">
            {view.risks.map((item) => (
              <li key={item.risk}>
                {item.risk}
                {item.mitigation ? `：${item.mitigation}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
