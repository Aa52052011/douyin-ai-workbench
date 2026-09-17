import type { PositioningInput, PositioningOutput } from "../lib/positioning.types";
import { positioningSourceLabel } from "../lib/ux/positioning-source";

export function PositioningSummary({
  output,
  input,
  platform,
  specialLimits,
  onEdit,
}: {
  output: PositioningOutput;
  input?: PositioningInput | null;
  platform?: string;
  specialLimits?: string;
  onEdit?: (block: "core" | "audience" | "direction" | "style") => void;
}) {
  const goal = input?.goal || output.publishingStrategy.frequency;
  const style = [output.persona.identity, output.persona.tone].filter(Boolean).join(" · ");
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2" data-acf-positioning-summary>
      <SummaryBlock title="账号定位" value={output.accountPositioning} source="ai" onEdit={onEdit ? () => onEdit("core") : undefined} />
      <SummaryBlock title="目标用户" value={output.targetAudience.description} source="ai" onEdit={onEdit ? () => onEdit("audience") : undefined} />
      <SummaryBlock title="核心目标" value={goal} source="ai" onEdit={onEdit ? () => onEdit("direction") : undefined} />
      <SummaryBlock title="内容风格" value={style} source="ai" onEdit={onEdit ? () => onEdit("style") : undefined} />
      <details className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2 xl:col-span-2">
        <summary className="cursor-pointer text-sm font-medium">更多设置</summary>
        <div className="mt-3 space-y-2 text-sm">
          {input?.industry ? <p>行业：{input.industry}</p> : null}
          <p>平台：{platform || input?.platform || "抖音"}</p>
          {input?.additionalInfo ? <p>补充要求：{input.additionalInfo}</p> : null}
          {specialLimits ? <p>特殊限制：{specialLimits}</p> : null}
        </div>
      </details>
    </div>
  );
}

function SummaryBlock({
  title,
  value,
  source,
  onEdit,
}: {
  title: string;
  value: string;
  source: "user" | "reuse" | "ai" | "suggest";
  onEdit?: () => void;
}) {
  return (
    <article className="self-start rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2.5">
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <h3 className="acf-card-title">{title}</h3>
        {onEdit ? (
          <button className="shrink-0 text-sm underline" type="button" onClick={onEdit}>
            编辑
          </button>
        ) : null}
      </div>
      <p className="text-sm leading-5">{value}</p>
      <p className="acf-caption mt-1">来源：{positioningSourceLabel(source)}</p>
    </article>
  );
}
