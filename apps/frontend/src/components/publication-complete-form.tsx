import { PUBLICATION_URL_MAX, PUBLICATION_WORK_ID_MAX, type PublicationCompleteForm } from "../lib/publication.types";
import { canSubmitComplete, validateExternalUrl } from "../lib/publication.form";

export function PublicationCompleteFormFields({
  form,
  pending,
  onChange,
  onSubmit,
}: {
  form: PublicationCompleteForm;
  pending: boolean;
  onChange: (next: PublicationCompleteForm) => void;
  onSubmit: () => void;
}) {
  const urlError = validateExternalUrl(form.externalUrl);

  return (
    <form
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-neutral-600">把已经发出去的作品登记到系统里，方便后续录入表现数据。</p>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="publish-url">
          作品链接
        </label>
        <input
          id="publish-url"
          className="w-full min-w-0 break-all rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="url"
          maxLength={PUBLICATION_URL_MAX}
          disabled={pending}
          value={form.externalUrl}
          placeholder="https://"
          onChange={(event) => onChange({ ...form, externalUrl: event.target.value })}
        />
        {urlError ? (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {urlError}
          </p>
        ) : null}
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-neutral-600">高级：作品 ID（可选）</summary>
        <label className="mt-2 mb-1 block text-sm font-medium" htmlFor="publish-work-id">
          作品 ID（可选）
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
        disabled={pending || !canSubmitComplete(form)}
      >
        标记已发布
      </button>
    </form>
  );
}
