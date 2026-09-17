export type PlanningAcceptedFeedbackItem = {
  recommendationId?: string;
  recommendedAction: string;
};

export function PlanningAcceptedFeedbackNotice({
  items,
  ignored,
  showIgnoreControl,
  onToggleIgnore,
}: {
  items: PlanningAcceptedFeedbackItem[];
  ignored: boolean;
  showIgnoreControl: boolean;
  onToggleIgnore?: (ignored: boolean) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface-muted)] px-4 py-3 text-sm"
      data-acf-planning-accepted-feedback
    >
      {ignored ? (
        <p className="font-medium text-neutral-950">本轮将不参考上一轮已采纳建议。</p>
      ) : (
        <p className="font-medium text-neutral-950">
          已参考上一轮发布表现和你采纳的 {items.length} 条建议。
        </p>
      )}
      <p className="mt-1 text-neutral-600">
        仅作参考，不会自动改选题、定位或推广目标。仍需你点击「生成内容计划」后确认。
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-neutral-700">查看已采纳建议</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
          {items.map((item, index) => (
            <li key={item.recommendationId || String(index)}>{item.recommendedAction}</li>
          ))}
        </ul>
      </details>
      {showIgnoreControl && onToggleIgnore ? (
        <button
          className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          type="button"
          onClick={() => onToggleIgnore(!ignored)}
        >
          {ignored ? "重新参考这些建议" : "本轮不参考这些建议"}
        </button>
      ) : null}
    </section>
  );
}
