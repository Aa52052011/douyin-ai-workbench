import type { VideoView } from "../lib/video.types";
import { ProductionPlanPanel } from "./production-plan-panel";
import { QualitySummary } from "./quality-summary";
import { VideoProgress } from "./video-progress";

export function VideoDetail({
  view,
  previewUrl,
  previewUnavailable,
  videoId,
  accessToken,
}: {
  view: VideoView;
  previewUrl?: string | null;
  previewUnavailable?: boolean;
  videoId?: string;
  accessToken?: string | null;
}) {
  const completed = view.statusLabel === "已完成";
  const failed = view.statusLabel === "制作失败";

  return (
    <article className="space-y-4">
      {completed ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">成片预览</h2>
          {previewUrl ? (
            <video
              className="mx-auto max-h-[70vh] w-full bg-black object-contain"
              controls
              playsInline
              src={previewUrl}
              style={{ aspectRatio: "9 / 16", maxWidth: 360 }}
            />
          ) : previewUnavailable ? (
            <p className="text-sm text-neutral-600">视频文件暂时不可用。可以稍后重试预览，或先下载（若导出可用）。</p>
          ) : (
            <div className="mx-auto flex aspect-[9/16] max-h-[70vh] max-w-[360px] items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-600">
              正在准备预览…
            </div>
          )}
        </section>
      ) : null}

      {failed ? (
        <section className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm" role="alert">
          <h2 className="font-medium">视频没有生成完成</h2>
          {view.failedStageLabel ? <p className="mt-1">{view.failedStageLabel}</p> : null}
          {view.failureMessage ? <p className="mt-1 break-words">{view.failureMessage}</p> : null}
          <p className="mt-2">可以重试生成，或查看折叠的技术细节。</p>
        </section>
      ) : null}

      {!completed ? <VideoProgress view={view} /> : null}

      {videoId && accessToken ? <ProductionPlanPanel videoId={videoId} accessToken={accessToken} /> : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-medium">视频信息</h2>
        <p>来源脚本：{view.sourceScriptTitle}</p>
        <p>状态：{view.statusLabel}</p>
        {view.durationLabel ? <p>时长：{view.durationLabel}</p> : null}
        {view.createdAtLabel ? <p>创建时间：{view.createdAtLabel}</p> : null}
        {view.qualityLabel || view.qualitySummary.length > 0 ? (
          <div className="mt-3">
            <QualitySummary statusLabel={view.qualityLabel} items={view.qualitySummary} />
          </div>
        ) : null}
      </section>

      <details className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">生成详情</summary>
        <dl className="mt-3 space-y-1 text-neutral-700">
          {view.startedAtLabel ? (
            <div>
              <dt className="text-neutral-500">开始时间</dt>
              <dd>{view.startedAtLabel}</dd>
            </div>
          ) : null}
          {view.completedAtLabel ? (
            <div>
              <dt className="text-neutral-500">完成时间</dt>
              <dd>{view.completedAtLabel}</dd>
            </div>
          ) : null}
          {view.failedStageLabel ? (
            <div>
              <dt className="text-neutral-500">失败阶段</dt>
              <dd>{view.failedStageLabel}</dd>
            </div>
          ) : null}
        </dl>
        <ul className="mt-3 space-y-1">
          {view.stages.map((stage) => (
            <li key={stage.key}>{stage.label}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
