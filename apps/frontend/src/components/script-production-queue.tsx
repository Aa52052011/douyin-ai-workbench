"use client";

import { useState, type ReactNode } from "react";
import type { TopicProductionItem } from "../lib/content-planning.production";
import { resolveTopicUserFacingV2 } from "../lib/content-planning.production";
import type { ScriptRecord } from "../lib/script.types";
import type { VideoRecord } from "../lib/video.types";
import { scriptQueueMark, scriptWorkspaceStatusLabel } from "../lib/script.workspace";

export function ScriptTopicQueueV1({
  items,
  currentTopicId,
  selectedTopicId,
  onSelect,
  compact,
  projectId,
  planId,
  scripts = [],
  videos = [],
  generatingTopicId,
}: {
  items: TopicProductionItem[];
  currentTopicId?: string | null;
  selectedTopicId?: string | null;
  onSelect: (topicId: string) => void;
  compact?: boolean;
  projectId: string;
  planId: string;
  scripts?: ScriptRecord[];
  videos?: VideoRecord[];
  generatingTopicId?: string | null;
}) {
  if (items.length === 0) {
    return null;
  }

  const list = (
    <ul className="space-y-1" data-acf-script-queue>
      {items.map((item) => {
        const isSelected = item.topicId === selectedTopicId;
        const generating = generatingTopicId === item.topicId;
        const facing = resolveTopicUserFacingV2({
          projectId,
          planId,
          planConfirmed: true,
          item,
          scripts,
          videos,
        });
        const label = generating
          ? scriptWorkspaceStatusLabel({ generating: true })
          : facing.label;
        const mark = scriptQueueMark(label);
        return (
          <li key={item.topicId}>
            <button
              type="button"
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelect(item.topicId)}
              className={`flex w-full items-start gap-2 rounded-[var(--acf-radius-sm)] border px-2 py-2 text-left text-sm ${
                isSelected
                  ? "border-[var(--acf-border)] bg-[var(--acf-brand-soft)]"
                  : "border-transparent hover:bg-[var(--acf-surface-muted)]"
              }`}
            >
              <span className={`mt-0.5 w-4 shrink-0 text-xs ${mark === "✓" ? "text-[var(--acf-success)]" : mark === "●" ? "text-[var(--acf-brand)]" : ""}`} aria-hidden>
                {mark}
              </span>
              <span className="min-w-0 flex-1">
                <span className="acf-caption block">第 {item.dayIndex} 条</span>
                <span className="block line-clamp-2">{item.title}</span>
                <span className="acf-caption mt-0.5 block text-[var(--acf-text-secondary)]">{label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (compact) {
    const current = items.find((item) => item.topicId === (selectedTopicId || currentTopicId));
    return (
      <CompactScriptQueue current={current} list={list} />
    );
  }

  return (
    <nav className="pr-1" aria-label="本周内容队列">
      <p className="acf-caption px-2">本周内容</p>
      <div className="mt-2 max-h-[min(70vh,36rem)] overflow-y-auto">{list}</div>
    </nav>
  );
}

function CompactScriptQueue({
  current,
  list,
}: {
  current?: TopicProductionItem;
  list: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <p className="acf-caption">本周内容</p>
      <p className="mt-1 text-sm font-medium">{current ? `第 ${current.dayIndex} 条 · ${current.title}` : "选择一条内容"}</p>
      <details
        className="mt-2"
        open={open}
        onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary className="min-h-9 cursor-pointer text-sm" aria-expanded={open}>
          切换本期内容
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">{list}</div>
      </details>
    </section>
  );
}

/** @deprecated name kept for script-queue selfcheck */
export function ScriptProductionQueue(
  props: Parameters<typeof ScriptTopicQueueV1>[0] & { scriptReadyCount?: number },
) {
  const { scriptReadyCount: _scriptReadyCount, ...rest } = props;
  return <ScriptTopicQueueV1 {...rest} />;
}
