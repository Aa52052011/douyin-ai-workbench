import type { VideoView } from "../lib/video.types";

export function VideoPreviewPanelV2({
  previewUrl,
  previewUnavailable,
  landscape,
  loading,
  onRetry,
}: {
  previewUrl?: string | null;
  previewUnavailable?: boolean;
  landscape?: boolean;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const frameClass = "mx-auto w-full rounded-lg bg-black object-contain";
  const frameStyle = landscape
    ? { aspectRatio: "16 / 9", maxWidth: 880, maxHeight: "min(56vh, 28rem)" }
    : { aspectRatio: "9 / 16", maxWidth: 360, maxHeight: "min(70vh, 36rem)" };

  return (
    <section className="flex justify-center rounded-[var(--acf-radius-md)] bg-[var(--acf-surface-muted)] p-4" data-acf-video-preview-panel-v2>
      <div className="w-full">
        <h2 className="mb-3 text-sm font-medium">成片预览</h2>
        {previewUrl ? (
          <video
            key={previewUrl}
            className={frameClass}
            controls
            playsInline
            src={previewUrl}
            style={frameStyle}
            data-acf-preview-variant={landscape ? "landscape" : "vertical"}
          />
        ) : previewUnavailable ? (
          <div className="space-y-2 text-sm">
            <p>视频暂时无法播放</p>
            {onRetry ? (
              <button className="text-sm underline" type="button" onClick={onRetry}>
                重试
              </button>
            ) : null}
          </div>
        ) : loading ? (
          <div
            className="mx-auto flex items-center justify-center rounded-lg bg-neutral-200 text-sm text-neutral-600"
            style={frameStyle}
            aria-busy="true"
          >
            正在准备预览…
          </div>
        ) : (
          <div className="mx-auto flex aspect-[9/16] max-h-[70vh] max-w-[360px] items-center justify-center rounded-lg bg-neutral-100 text-sm">
            视频文件仍在准备中
          </div>
        )}
      </div>
    </section>
  );
}

/** Kept for wave-4 selfcheck; workspace uses VideoPreviewPanelV2. */
export function VideoDetail({
  view,
  previewUrl,
  previewUnavailable,
  landscape,
}: {
  view: VideoView;
  previewUrl?: string | null;
  previewUnavailable?: boolean;
  videoId?: string;
  accessToken?: string | null;
  landscape?: boolean;
}) {
  return (
    <article className="space-y-4">
      <VideoPreviewPanelV2 previewUrl={previewUrl} previewUnavailable={previewUnavailable} landscape={landscape} loading={!previewUrl && !previewUnavailable} />
      {view.durationLabel ? <p className="break-words text-sm">时长：{view.durationLabel}</p> : null}
    </article>
  );
}
