import type { MetricFormState } from "../lib/performance.types";
import { canSubmitMetrics } from "../lib/performance.form";
import { integerFieldError } from "../lib/ux/publication-monitoring-v5";

export function PerformanceMetricForm({
  form,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: MetricFormState;
  pending: boolean;
  onChange: (next: MetricFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4"
      data-acf-metrics-entry-v5
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm font-medium">新增一条数据记录</p>
      <p className="text-sm text-neutral-600">填写你现在在抖音看到的数据即可。当前数据由你手动录入。</p>
      <p className="text-xs text-neutral-500">当前数据以你录入的抖音后台数据为准。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField id="metric-views" label="播放量" value={form.views} pending={pending} onChange={(views) => onChange({ ...form, views })} />
        <NumberField id="metric-likes" label="点赞" value={form.likes} pending={pending} onChange={(likes) => onChange({ ...form, likes })} />
        <NumberField id="metric-comments" label="评论" value={form.comments} pending={pending} onChange={(comments) => onChange({ ...form, comments })} />
        <NumberField id="metric-shares" label="分享" value={form.shares} pending={pending} onChange={(shares) => onChange({ ...form, shares })} />
        <NumberField id="metric-favorites" label="收藏" value={form.favorites} pending={pending} onChange={(favorites) => onChange({ ...form, favorites })} />
        <NumberField
          id="metric-followers"
          label="粉丝变化"
          value={form.newFollowers}
          pending={pending}
          onChange={(newFollowers) => onChange({ ...form, newFollowers })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="metric-observed">
          采集时间
        </label>
        <input
          id="metric-observed"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="datetime-local"
          disabled={pending}
          value={form.observedAt}
          onChange={(event) => onChange({ ...form, observedAt: event.target.value })}
        />
        <p className="mt-1 text-xs text-neutral-500">默认为当前时间，可以直接改。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50" type="submit" disabled={pending || !canSubmitMetrics(form)}>
          保存这次记录
        </button>
        <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  pending,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  pending: boolean;
  unit?: string;
  onChange: (value: string) => void;
}) {
  const error = integerFieldError(value);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
        {unit ? <span className="ml-1 font-normal text-neutral-500">（{unit}）</span> : null}
      </label>
      <input
        id={id}
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        inputMode="numeric"
        min={0}
        step={1}
        disabled={pending}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
