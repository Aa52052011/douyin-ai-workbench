import type { PublicationView } from "../lib/publication.types";

export function PublicationDetail({ view }: { view: PublicationView }) {
  return (
    <article className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <p className="text-lg font-medium" aria-live="polite">
        {view.statusLabel}
      </p>
      <p>来源视频：{view.sourceVideoTitle}</p>
      {view.title ? <p>标题：{view.title}</p> : null}
      {view.publishedAtLabel ? <p>发布时间：{view.publishedAtLabel}</p> : null}
      {view.externalUrl ? (
        <p className="break-all">
          作品链接：
          <a className="underline" href={view.externalUrl} target="_blank" rel="noopener noreferrer">
            {view.externalUrl}
          </a>
        </p>
      ) : null}
      {view.externalPostId ? <p>作品 ID：{view.externalPostId}</p> : null}
      {view.createdAtLabel ? <p>创建时间：{view.createdAtLabel}</p> : null}
      {view.failureMessage ? (
        <p className="text-red-600" role="alert">
          {view.failureMessage}
        </p>
      ) : null}
    </article>
  );
}
