"use client";

import { FinalReviewChecklistV4 } from "./final-review-checklist";
import { HumanReviewBar } from "./ui/human-review-bar";
import { Button } from "./ui/button";

export function VideoReviewPanelV2({
  statusLabel,
  versionLabel,
  createdAtLabel,
  durationLabel,
  canAccept,
  pending,
  accepted,
  onAccept,
  onRequestChanges,
}: {
  statusLabel: string;
  versionLabel?: string;
  createdAtLabel?: string;
  durationLabel?: string;
  canAccept: boolean;
  pending?: boolean;
  accepted?: boolean;
  onAccept: () => void;
  onRequestChanges: () => void;
}) {
  return (
    <section className="space-y-4" data-acf-video-review-panel-v2>
      <div>
        <p className="text-sm font-medium">{statusLabel}</p>
        <p className="acf-caption mt-1">
          {[versionLabel, createdAtLabel, durationLabel].filter(Boolean).join(" · ")}
        </p>
      </div>
      {accepted ? <p className="font-medium">✓ 最终成片已确认</p> : null}
      {canAccept && !accepted ? (
        <>
          <p className="text-sm">请确认最终成片：画面、声音、字幕和节奏是否符合预期。</p>
          <FinalReviewChecklistV4 />
          <HumanReviewBar
            context="这条成片"
            confirmLabel={pending ? "正在确认…" : "确认最终成片"}
            requestChangesLabel="需要修改"
            onConfirm={onAccept}
            onRequestChanges={onRequestChanges}
          />
        </>
      ) : null}
    </section>
  );
}

export function VideoAcceptedActions({
  verticalHrefBusy,
  landscapeAvailable,
  downloadLabel,
  onDownloadVertical,
  onDownloadLandscape,
  publishHref,
}: {
  verticalHrefBusy?: boolean;
  landscapeAvailable: boolean;
  downloadLabel: string;
  onDownloadVertical: () => void;
  onDownloadLandscape: () => void;
  publishHref: string;
}) {
  return (
    <div className="space-y-3">
      <Button type="button" disabled={verticalHrefBusy} onClick={onDownloadVertical}>
        {downloadLabel}
      </Button>
      {landscapeAvailable ? (
        <Button variant="secondary" type="button" disabled={verticalHrefBusy} onClick={onDownloadLandscape}>
          下载横版视频
        </Button>
      ) : null}
      <div className="text-sm">
        <p className="font-medium">下一步：发布到抖音</p>
        <p className="acf-caption mt-1">下载视频后，请在抖音完成发布，再回来登记作品。</p>
        <a className="mt-2 inline-block text-sm underline" href={publishHref}>
          前往发布与数据
        </a>
      </div>
    </div>
  );
}
