import type { MetricFormState } from "../lib/performance.types";
import { canSubmitMetrics } from "../lib/performance.form";

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
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-neutral-600">新增一次数据记录，不会覆盖之前的观测。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField id="metric-views" label="播放量" value={form.views} pending={pending} onChange={(views) => onChange({ ...form, views })} />
        <NumberField id="metric-likes" label="点赞" value={form.likes} pending={pending} onChange={(likes) => onChange({ ...form, likes })} />
        <NumberField id="metric-comments" label="评论" value={form.comments} pending={pending} onChange={(comments) => onChange({ ...form, comments })} />
        <NumberField id="metric-shares" label="分享" value={form.shares} pending={pending} onChange={(shares) => onChange({ ...form, shares })} />
        <NumberField id="metric-favorites" label="收藏" value={form.favorites} pending={pending} onChange={(favorites) => onChange({ ...form, favorites })} />
        <NumberField
          id="metric-completion"
          label="完播率"
          unit="%"
          value={form.completionRatePercent}
          pending={pending}
          onChange={(completionRatePercent) => onChange({ ...form, completionRatePercent })}
        />
        <NumberField
          id="metric-watch"
          label="平均观看时长"
          unit="秒"
          value={form.averageWatchTimeSeconds}
          pending={pending}
          onChange={(averageWatchTimeSeconds) => onChange({ ...form, averageWatchTimeSeconds })}
        />
        <NumberField
          id="metric-followers"
          label="新增粉丝"
          value={form.newFollowers}
          pending={pending}
          onChange={(newFollowers) => onChange({ ...form, newFollowers })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="metric-observed">
          数据采集时间
        </label>
        <input
          id="metric-observed"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="datetime-local"
          disabled={pending}
          value={form.observedAt}
          onChange={(event) => onChange({ ...form, observedAt: event.target.value })}
        />
        <p className="mt-1 text-xs text-neutral-500">可改。留空则按当前时间记录。发布后观察时长由系统根据发布时间计算。</p>
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
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
        {unit ? <span className="ml-1 font-normal text-neutral-500">（{unit}）</span> : null}
      </label>
      <input
        id={id}
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        type="number"
        min={0}
        step="any"
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
