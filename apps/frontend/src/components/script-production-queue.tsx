"use client";

import type { TopicProductionItem } from "../lib/content-planning.production";

export function ScriptProductionQueue({
  items,
  currentTopicId,
  selectedTopicId,
  scriptReadyCount,
  onSelect,
  compact,
}: {
  items: TopicProductionItem[];
  currentTopicId?: string | null;
  selectedTopicId?: string | null;
  scriptReadyCount: number;
  onSelect: (topicId: string) => void;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  const completed = items.filter((item) => item.status !== "NOT_STARTED");
  const pending = items.filter((item) => item.status === "NOT_STARTED");

  if (compact) {
    const current = items.find((item) => item.topicId === (selectedTopicId || currentTopicId));
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <p className="text-xs text-neutral-500">本期脚本制作进度</p>
        <p className="mt-1 font-medium text-neutral-950">
          脚本 {scriptReadyCount} / {items.length}
          {current ? ` · 当前 ${current.sequenceLabel}` : ""}
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-600">查看本期全部内容</summary>
          <QueueList
            items={items}
            currentTopicId={currentTopicId}
            selectedTopicId={selectedTopicId}
            onSelect={onSelect}
            className="mt-2"
          />
        </details>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-medium text-neutral-950">本期脚本制作进度</h2>
          <p className="mt-1 text-xs text-neutral-500">
            脚本 {scriptReadyCount} / {items.length}
          </p>
        </div>
      </div>

      {completed.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-600">
            已完成 {completed.length} 条
          </summary>
          <QueueList
            items={completed}
            currentTopicId={currentTopicId}
            selectedTopicId={selectedTopicId}
            onSelect={onSelect}
            className="mt-2 opacity-80"
          />
        </details>
      ) : null}

      <QueueList
        items={pending.length > 0 ? pending : items}
        currentTopicId={currentTopicId}
        selectedTopicId={selectedTopicId}
        onSelect={onSelect}
        className="mt-3"
        emphasizeCurrent
      />
    </section>
  );
}

function QueueList({
  items,
  currentTopicId,
  selectedTopicId,
  onSelect,
  className,
  emphasizeCurrent,
}: {
  items: TopicProductionItem[];
  currentTopicId?: string | null;
  selectedTopicId?: string | null;
  onSelect: (topicId: string) => void;
  className?: string;
  emphasizeCurrent?: boolean;
}) {
  return (
    <ul className={`space-y-1 ${className ?? ""}`}>
      {items.map((item) => {
        const isCurrent = item.topicId === currentTopicId;
        const isSelected = item.topicId === selectedTopicId;
        const done = item.status !== "NOT_STARTED";
        return (
          <li key={item.topicId}>
            <button
              type="button"
              onClick={() => onSelect(item.topicId)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                isSelected || (emphasizeCurrent && isCurrent)
                  ? "bg-neutral-950 text-white"
                  : done
                    ? "text-neutral-500 hover:bg-neutral-50"
                    : "text-neutral-800 hover:bg-neutral-50"
              }`}
            >
              <span className="mt-0.5 w-4 shrink-0 text-xs">{done ? "✓" : isCurrent ? "→" : "○"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs opacity-80">{item.sequenceLabel}</span>
                <span className="block truncate text-sm">{item.title}</span>
                <span className="block text-xs opacity-80">
                  {isCurrent && !done ? "下一条 · " : ""}
                  {item.statusLabel}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
