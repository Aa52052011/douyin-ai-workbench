import type { VideoView } from "../lib/video.types";
import { VideoProgress } from "./video-progress";

export function VideoDetail({
  view,
  previewUrl,
  previewUnavailable,
}: {
  view: VideoView;
  previewUrl?: string | null;
  previewUnavailable?: boolean;
}) {
  const completed = view.statusLabel === "已完成";
  const failed = view.statusLabel === "制作失败";

  return (
    <article className="space-y-4">
      {completed ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">成片预览</h2>
          {previewUrl ? (
            <video className="w-full rounded-lg bg-black" controls src={previewUrl} />
          ) : (
            <p className="text-sm text-neutral-600">
              {previewUnavailable ? "成片已完成，可导出后查看。" : "正在准备预览…"}
            </p>
          )}
        </section>
      ) : null}

      {failed ? (
        <section className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm" role="alert">
          <h2 className="font-medium">视频生成失败</h2>
          {view.failedStageLabel ? <p className="mt-1">失败阶段：{view.failedStageLabel}</p> : null}
          {view.failureMessage ? <p className="mt-1 break-words">{view.failureMessage}</p> : null}
        </section>
      ) : null}

      {!completed ? <VideoProgress view={view} /> : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-medium">视频信息</h2>
        <p>来源脚本：{view.sourceScriptTitle}</p>
        <p>状态：{view.statusLabel}</p>
        {view.durationLabel ? <p>时长：{view.durationLabel}</p> : null}
        {view.createdAtLabel ? <p>创建时间：{view.createdAtLabel}</p> : null}
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
