import type { PositioningOutput } from "../lib/positioning.types";

export function PositioningSummary({
  output,
  platform,
  onEdit,
}: {
  output: PositioningOutput;
  platform?: string;
  onEdit?: (block: "core" | "audience" | "direction" | "style") => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-neutral-200 bg-white p-4" data-acf-positioning-summary>
      <SummaryBlock title="一句核心定位" onEdit={onEdit ? () => onEdit("core") : undefined}>
        <p>{output.accountPositioning}</p>
      </SummaryBlock>
      <SummaryBlock title="目标用户" onEdit={onEdit ? () => onEdit("audience") : undefined}>
        <p>{output.targetAudience.description}</p>
      </SummaryBlock>
      <SummaryBlock title="内容方向" onEdit={onEdit ? () => onEdit("direction") : undefined}>
        {output.contentNiches.slice(0, 3).map((item) => (
          <p key={item.name}>
            {item.name} · {item.reason}
          </p>
        ))}
      </SummaryBlock>
      <SummaryBlock title="表达风格" onEdit={onEdit ? () => onEdit("style") : undefined}>
        <p>
          {output.persona.identity} · {output.persona.tone}
        </p>
      </SummaryBlock>
      <SummaryBlock title="平台">
        <p>{platform || "抖音"}</p>
      </SummaryBlock>
      <SummaryBlock title="关键目标">
        <p>{output.publishingStrategy.frequency}</p>
      </SummaryBlock>
    </div>
  );
}

function SummaryBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {onEdit ? (
          <button className="text-xs underline" type="button" onClick={onEdit}>
            修改
          </button>
        ) : null}
      </div>
      <div className="space-y-1 text-sm leading-6">{children}</div>
    </section>
  );
}
