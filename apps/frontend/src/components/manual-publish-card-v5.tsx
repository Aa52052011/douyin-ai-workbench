"use client";

import { ManualPublishGuideV4 } from "./manual-publish-guide";
import { MANUAL_PUBLISH_MODE_COPY } from "../lib/ux/publication-monitoring-v5";

export function ManualPublishCardV5({
  title,
  verticalReady,
  downloaded,
  onConfirmPublished,
  confirmPending,
  showGuide,
}: {
  title: string;
  verticalReady: boolean;
  downloaded: boolean;
  onConfirmPublished: () => void;
  confirmPending?: boolean;
  showGuide?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4" data-acf-manual-publish-card-v5>
      <h2 className="text-base font-medium">手动发布到抖音</h2>
      <p>视频标题：{title || "未命名视频"}</p>
      <p>竖版成片：{verticalReady ? "已就绪" : "尚未就绪"}</p>
      <p>是否已下载：{downloaded ? "已开始下载" : "还未下载"}</p>
      <p>当前发布模式：{MANUAL_PUBLISH_MODE_COPY}</p>
      <p className="text-sm text-neutral-600">下一步：下载视频，在抖音发布，再回来登记作品。</p>
      {showGuide ? <ManualPublishGuideV4 /> : null}
      <button
        className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
        type="button"
        disabled={confirmPending}
        onClick={onConfirmPublished}
      >
        我已经发布
      </button>
    </section>
  );
}
