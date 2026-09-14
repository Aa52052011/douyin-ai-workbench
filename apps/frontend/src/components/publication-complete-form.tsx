import { PUBLICATION_URL_MAX, PUBLICATION_WORK_ID_MAX, type PublicationCompleteForm } from "../lib/publication.types";
import { canSubmitComplete, validateExternalUrl } from "../lib/publication.form";
import { isDouyinShortLink, registrationVerificationCopy } from "../lib/ux/publication-monitoring-v5";

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
  const formatOk =
    Boolean(form.externalUrl.trim()) && !urlError && !isDouyinShortLink(form.externalUrl);

  return (
    <form
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
      data-acf-published-post-registration-v5
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm font-medium">告诉系统：刚才这条视频对应哪个抖音作品</p>
      <p className="text-sm text-neutral-600">把已经发出去的作品登记到系统里，方便后续录入表现数据。</p>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="publish-url">
          抖音作品链接
        </label>
        <p className="mb-1 text-xs text-neutral-500">把发布后的作品链接粘贴到这里</p>
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
        {formatOk ? (
          <p className="mt-1 text-sm text-neutral-600">{registrationVerificationCopy("FORMAT_VALIDATED")}</p>
        ) : null}
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-neutral-600">没有链接？也可以填写作品 ID</summary>
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
        disabled={pending || !canSubmitComplete(form)}
      >
        完成登记
      </button>
    </form>
  );
}
