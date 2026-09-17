"use client";

import type { PublicationView } from "../lib/publication.types";
import { publicationTruthCopy, registrationVerificationCopy } from "../lib/ux/publication-monitoring-v5";
import { TechnicalDetailsPanel } from "./ui/error-state";

export function PublicationDetail({
  view,
  registeredAtLabel,
  userPublishedAtLabel,
  linkedVideoTitle,
  statusLabel = registrationVerificationCopy("USER_ASSERTED"),
  truthCopy = publicationTruthCopy(),
}: {
  view: PublicationView;
  registeredAtLabel?: string;
  userPublishedAtLabel?: string;
  linkedVideoTitle?: string | null;
  statusLabel?: string;
  truthCopy?: string;
}) {
  const title = view.title.trim() && view.title !== "发布记录" ? view.title : "";
  const hasMeta = Boolean(linkedVideoTitle || view.createdAtLabel || view.externalPostId);
  return (
    <article className="space-y-3 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 text-sm shadow-[var(--acf-shadow-subtle)]" data-acf-publication-detail>
      <p className="inline-flex rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand-soft)] px-2 py-0.5 text-sm font-medium text-[var(--acf-brand)]" aria-live="polite">
        状态：{statusLabel}
      </p>
      {title ? <p>标题：{title}</p> : null}
      {view.externalUrl ? (
        <p className="break-all">
          作品链接：
          <a className="underline" href={view.externalUrl} target="_blank" rel="noopener noreferrer">
            {view.externalUrl}
          </a>
        </p>
      ) : null}
      {registeredAtLabel ? <p>登记时间：{registeredAtLabel}</p> : null}
      {userPublishedAtLabel ? <p>用户填写的发布时间：{userPublishedAtLabel}</p> : null}
      <p className="acf-caption rounded-[var(--acf-radius-sm)] bg-[var(--acf-warning-soft)] px-2 py-1 text-[var(--acf-warning)]">{truthCopy}</p>
      {view.failureMessage ? (
        <p className="text-red-600" role="alert">
          {view.failureMessage}
        </p>
      ) : null}
      {hasMeta ? (
        <details className="text-sm" data-acf-publication-work-info>
          <summary className="cursor-pointer">作品信息</summary>
          <div className="mt-2 space-y-1 text-[var(--acf-text-secondary)]">
            {linkedVideoTitle ? <p>关联成片：{linkedVideoTitle}</p> : null}
            {view.createdAtLabel ? <p>创建时间：{view.createdAtLabel}</p> : null}
            {view.externalPostId ? <TechnicalDetailsPanel details={`作品识别信息已随这次登记提交。`} /> : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}
