import { HumanReviewBar } from "./ui/human-review-bar";
import { Button } from "./ui/button";

export function ScriptReviewPanelV2({
  statusLabel,
  version,
  updatedAt,
  canConfirm,
  pending,
  onConfirm,
  onRequestChanges,
}: {
  statusLabel: string;
  version?: number;
  updatedAt?: string;
  canConfirm: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onRequestChanges: () => void;
}) {
  return (
    <section className="mt-6 border-t border-[var(--acf-border-subtle)] pt-4" data-acf-script-review-panel-v2>
      <p className="text-sm">状态：{statusLabel}</p>
      <p className="acf-caption mt-1">
        {[typeof version === "number" ? `第${version}版` : "", updatedAt].filter(Boolean).join(" · ")}
      </p>
      {canConfirm ? (
        <>
          <p className="mt-3 text-sm">请确认：脚本内容是否符合你的表达和目标。</p>
          <div className="mt-3">
            <HumanReviewBar
              context="这条视频脚本"
              confirmLabel={pending ? "正在确认…" : "确认脚本"}
              requestChangesLabel="需要修改"
              onConfirm={onConfirm}
              onRequestChanges={onRequestChanges}
            />
          </div>
        </>
      ) : null}
      {!canConfirm ? <p className="sr-only">确认脚本</p> : null}
    </section>
  );
}

export function ScriptConfirmedActions({
  videoHref,
  onModify,
  onHistory,
}: {
  videoHref: string;
  onModify: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <a
        className="inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
        href={videoHref}
      >
        制作视频
      </a>
      <span className="sr-only">开始制作视频</span>
      <Button variant="secondary" type="button" onClick={onModify}>
        修改脚本
      </Button>
      <Button variant="ghost" type="button" onClick={onHistory}>
        查看历史版本
      </Button>
    </div>
  );
}
