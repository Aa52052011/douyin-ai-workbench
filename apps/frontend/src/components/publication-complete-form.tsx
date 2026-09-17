"use client";

import { PUBLICATION_TITLE_MAX, PUBLICATION_URL_MAX, PUBLICATION_WORK_ID_MAX, type PublicationCompleteForm } from "../lib/publication.types";
import { canSubmitComplete, linkFormatCopy, validateExternalUrl } from "../lib/publication.form";

export function PublicationCompleteFormFields({
  form,
  pending,
  title,
  onTitleChange,
  onChange,
  onSubmit,
}: {
  form: PublicationCompleteForm;
  pending: boolean;
  title: string;
  onTitleChange: (next: string) => void;
  onChange: (next: PublicationCompleteForm) => void;
  onSubmit: () => void;
}) {
  const urlError = validateExternalUrl(form.externalUrl);
  const formatCopy = linkFormatCopy(form.externalUrl);

  return (
    <form
      className="space-y-4 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4"
      data-acf-published-post-registration-v5
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 className="text-base font-medium">登记已发布作品</h2>
      <p className="text-sm text-neutral-600">粘贴你刚刚在抖音发布的视频链接，我们会用它关联后续数据。</p>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="publish-url">
          抖音作品链接
        </label>
        <input
          id="publish-url"
          className="w-full min-w-0 break-all rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="url"
          required
          maxLength={PUBLICATION_URL_MAX}
          disabled={pending}
          value={form.externalUrl}
          placeholder="粘贴抖音作品链接，例如 https://v.douyin.com/..."
          onChange={(event) => onChange({ ...form, externalUrl: event.target.value })}
        />
        {urlError ? (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {urlError}
          </p>
        ) : null}
        {formatCopy ? <p className="mt-1 text-sm text-neutral-600">{formatCopy}</p> : null}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="publish-title">
          作品标题
        </label>
        <input
          id="publish-title"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          maxLength={PUBLICATION_TITLE_MAX}
          disabled={pending}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-neutral-600">高级：作品 ID</summary>
        <label className="mt-2 mb-1 block text-sm font-medium" htmlFor="publish-work-id">
          作品 ID
        </label>
        <input
          id="publish-work-id"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          maxLength={PUBLICATION_WORK_ID_MAX}
          disabled={pending}
          value={form.externalPostId}
          onChange={(event) => onChange({ ...form, externalPostId: event.target.value })}
        />
      </details>
      <button
        className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
        type="submit"
        disabled={pending || !title.trim() || !canSubmitComplete(form)}
      >
        {pending ? "正在登记…" : "登记作品"}
      </button>
    </form>
  );
}
