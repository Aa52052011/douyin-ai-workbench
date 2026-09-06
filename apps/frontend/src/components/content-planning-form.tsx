import type { PositioningOptionView } from "../lib/campaign-strategy.types";
import { PLANNING_DAYS_V1 } from "../lib/content-planning.types";
import type { PlanningFormState } from "../lib/content-planning.types";
import { expectedTopicCount } from "../lib/content-planning.form";

export function ContentPlanningForm({
  form,
  positioningOptions,
  strategyOptions,
  pending,
  noStrategyHint,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: PlanningFormState;
  positioningOptions: PositioningOptionView[];
  strategyOptions: Array<{ id: string; label: string }>;
  pending: boolean;
  noStrategyHint: boolean;
  onChange: (next: PlanningFormState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const expected = expectedTopicCount(form.planningDays, form.postsPerDay);

  return (
    <form
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-neutral-600">
        本次填写的计划周期和补充要求会控制这期计划；推广策略负责方向，账号定位负责内容边界。
      </p>
      <p className="text-sm text-neutral-600">如果已有发布表现，系统会自动参考最新反馈。</p>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="planning-positioning">
          账号定位
        </label>
        <select
          id="planning-positioning"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={form.positioningRunId}
          disabled={pending}
          onChange={(event) => onChange({ ...form, positioningRunId: event.target.value })}
        >
          {positioningOptions.map((option) => (
            <option key={option.runId} value={option.runId}>
              {option.accountPositioning}
              {option.audienceSummary ? ` · ${option.audienceSummary}` : ""}
              {option.createdAtLabel ? ` · ${option.createdAtLabel}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="planning-strategy">
          推广策略（可选）
        </label>
        <select
          id="planning-strategy"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={form.strategyId}
          disabled={pending}
          onChange={(event) => onChange({ ...form, strategyId: event.target.value })}
        >
          <option value="">不使用推广策略</option>
          {strategyOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {noStrategyHint ? (
          <p className="mt-2 text-sm text-neutral-600">未使用推广策略时，内容计划主要依据账号定位和本次要求生成。</p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="planning-days">
          计划天数
        </label>
        <input
          id="planning-days"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm"
          value={`${PLANNING_DAYS_V1} 天`}
          readOnly
        />
        <p className="mt-1 text-xs text-neutral-500">当前版本固定为 7 天。</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="planning-posts">
          每天发布数量
        </label>
        <input
          id="planning-posts"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="number"
          min={1}
          max={5}
          disabled={pending}
          value={form.postsPerDay}
          onChange={(event) => onChange({ ...form, postsPerDay: Number(event.target.value) || 1 })}
        />
        <p className="mt-1 text-sm text-neutral-600">
          预计生成：{form.planningDays} 天 × {form.postsPerDay} 条 = {expected} 个选题
        </p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">补充要求（可选）</span>
        <textarea
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={3}
          maxLength={2000}
          disabled={pending}
          value={form.additionalRequirements}
          placeholder="这周重点做敏感肌换季修护，不做强促销内容。"
          onChange={(event) => onChange({ ...form, additionalRequirements: event.target.value })}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          type="submit"
          disabled={pending || !form.positioningRunId}
        >
          生成内容计划
        </button>
        {onCancel ? (
          <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={onCancel}>
            取消
          </button>
        ) : null}
      </div>
    </form>
  );
}
