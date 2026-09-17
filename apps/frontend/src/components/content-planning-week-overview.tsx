import type { ProductionProgress, TopicProductionItem } from "../lib/content-planning.production";

function statusTone(status: TopicProductionItem["status"], isCurrent: boolean): string {
  if (isCurrent) {
    return "acf-stage-current border-[var(--acf-border)] bg-[var(--acf-surface)]";
  }
  if (status === "PUBLISHED") {
    return "border-[var(--acf-border)] bg-[var(--acf-surface-muted)] opacity-80";
  }
  if (status === "SCRIPT_READY" || status === "VIDEO_READY") {
    return "border-[var(--acf-border)] bg-[var(--acf-surface-muted)]";
  }
  return "border-[var(--acf-border)] bg-[var(--acf-surface)]";
}

export function ContentPlanningWeekOverview({
  items,
  progress,
  isSevenDay,
  currentTopicId,
  selectedTopicId,
  onSelect,
}: {
  items: TopicProductionItem[];
  progress: ProductionProgress;
  isSevenDay: boolean;
  currentTopicId?: string | null;
  selectedTopicId?: string | null;
  onSelect: (topicId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{isSevenDay ? "7 天内容总览" : "本期内容总览"}</h2>
          <p className="mt-1 text-xs text-neutral-500">共 {progress.topicCount} 条 · {progress.summaryLabel}</p>
        </div>
        <dl className="flex flex-wrap gap-3 text-xs text-neutral-600">
          <div>
            <dt className="inline text-neutral-500">脚本 </dt>
            <dd className="inline font-medium">
              {progress.scriptReadyCount} / {progress.topicCount}
            </dd>
          </div>
          <div>
            <dt className="inline text-neutral-500">视频 </dt>
            <dd className="inline font-medium">
              {progress.videoReadyCount} / {progress.topicCount}
            </dd>
          </div>
          <div>
            <dt className="inline text-neutral-500">已发布 </dt>
            <dd className="inline font-medium">
              {progress.publishedCount} / {progress.topicCount}
            </dd>
          </div>
        </dl>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const isCurrent = item.topicId === currentTopicId;
          const isSelected = item.topicId === selectedTopicId;
          return (
            <li key={item.topicId}>
              <button
                type="button"
                onClick={() => onSelect(item.topicId)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${statusTone(item.status, isCurrent || isSelected)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-500">{item.sequenceLabel}</span>
                  <span className="text-xs text-neutral-600">
                    {item.status !== "NOT_STARTED" ? "✓ " : ""}
                    {item.statusLabel}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium text-neutral-900">{item.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-neutral-500">
                  {[item.contentPillar || item.format, item.contentAngle].filter(Boolean).join(" · ") || "—"}
                </p>
                {isCurrent ? <p className="mt-2 text-xs font-medium text-neutral-900">下一条</p> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
