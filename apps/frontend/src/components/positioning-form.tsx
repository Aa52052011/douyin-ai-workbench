import type { ReactNode } from "react";
import type { PositioningFieldErrors } from "../lib/positioning.form";
import { POSITIONING_INPUT_LIMITS, type PositioningFormState } from "../lib/positioning.types";

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export function PositioningForm({
  form,
  errors,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: PositioningFormState;
  errors: PositioningFieldErrors;
  pending: boolean;
  onChange: (next: PositioningFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function set<K extends keyof PositioningFormState>(key: K, value: string) {
    onChange({ ...form, [key]: value });
  }

  return (
    <form
      className="space-y-6 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">基础方向</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="industry" label="行业" required error={errors.industry}>
            <input
              id="industry"
              className={inputClass}
              value={form.industry}
              maxLength={POSITIONING_INPUT_LIMITS.industry}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.industry)}
              aria-describedby={errors.industry ? "industry-error" : undefined}
              onChange={(event) => set("industry", event.target.value)}
            />
          </Field>
          <Field id="platform" label="平台" required error={errors.platform}>
            <input
              id="platform"
              className={inputClass}
              value={form.platform}
              maxLength={POSITIONING_INPUT_LIMITS.platform}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.platform)}
              aria-describedby={errors.platform ? "platform-error" : undefined}
              onChange={(event) => set("platform", event.target.value)}
            />
          </Field>
          <Field id="accountType" label="账号类型" required error={errors.accountType}>
            <input
              id="accountType"
              className={inputClass}
              value={form.accountType}
              maxLength={POSITIONING_INPUT_LIMITS.accountType}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.accountType)}
              aria-describedby={errors.accountType ? "accountType-error" : undefined}
              onChange={(event) => set("accountType", event.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">定位目标</legend>
        <Field id="goal" label="定位目标" required error={errors.goal}>
          <textarea
            id="goal"
            className={`${inputClass} min-h-24`}
            value={form.goal}
            maxLength={POSITIONING_INPUT_LIMITS.goal}
            required
            disabled={pending}
            aria-invalid={Boolean(errors.goal)}
            aria-describedby={errors.goal ? "goal-error" : undefined}
            onChange={(event) => set("goal", event.target.value)}
          />
        </Field>
        <Field id="targetAudience" label="目标受众" error={errors.targetAudience}>
          <textarea
            id="targetAudience"
            className={`${inputClass} min-h-24`}
            value={form.targetAudience}
            maxLength={POSITIONING_INPUT_LIMITS.targetAudience}
            disabled={pending}
            aria-invalid={Boolean(errors.targetAudience)}
            aria-describedby={errors.targetAudience ? "targetAudience-error" : undefined}
            onChange={(event) => set("targetAudience", event.target.value)}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">补充要求</legend>
        <Field id="expertise" label="内容偏好" error={errors.expertise}>
          <textarea
            id="expertise"
            className={`${inputClass} min-h-20`}
            value={form.expertise}
            maxLength={POSITIONING_INPUT_LIMITS.expertise}
            disabled={pending}
            aria-invalid={Boolean(errors.expertise)}
            aria-describedby={errors.expertise ? "expertise-error" : undefined}
            onChange={(event) => set("expertise", event.target.value)}
          />
        </Field>
        <Field id="additionalInfo" label="补充限制" error={errors.additionalInfo}>
          <textarea
            id="additionalInfo"
            className={`${inputClass} min-h-20`}
            value={form.additionalInfo}
            maxLength={POSITIONING_INPUT_LIMITS.additionalInfo}
            disabled={pending}
            aria-invalid={Boolean(errors.additionalInfo)}
            aria-describedby={errors.additionalInfo ? "additionalInfo-error" : undefined}
            onChange={(event) => set("additionalInfo", event.target.value)}
          />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" disabled={pending} type="submit">
          {pending ? "生成中…" : "生成账号定位"}
        </button>
        <button className="rounded-md border px-4 py-2 text-sm" disabled={pending} type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}
