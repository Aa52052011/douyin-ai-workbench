import type { PositioningOptionView } from "../lib/campaign-strategy.types";
import { PLANNING_DAYS_V1 } from "../lib/content-planning.types";
import type { PlanningFormState } from "../lib/content-planning.types";
import { expectedTopicCount } from "../lib/content-planning.form";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { PlanningAcceptedFeedbackNotice, type PlanningAcceptedFeedbackItem } from "./planning-accepted-feedback-notice";

export function ContentPlanningForm({
  form,
  positioningOptions,
  strategyOptions,
  pending,
  noStrategyHint,
  positioningSummary,
  acceptedFeedback,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: PlanningFormState;
  positioningOptions: PositioningOptionView[];
  strategyOptions: Array<{ id: string; label: string }>;
  pending: boolean;
  noStrategyHint: boolean;
  positioningSummary?: string;
  acceptedFeedback?: PlanningAcceptedFeedbackItem[];
  onChange: (next: PlanningFormState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const expected = expectedTopicCount(form.planningDays, form.postsPerDay);
  const selected = positioningOptions.find((item) => item.runId === form.positioningRunId);

  return (
    <form
      className="mx-auto max-w-xl space-y-5 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-neutral-600">已使用账号定位、目标用户、平台和内容风格，无需再填一遍。</p>
      <PlanningAcceptedFeedbackNotice
        items={acceptedFeedback ?? []}
        ignored={form.ignoreAcceptedPerformanceFeedback}
        showIgnoreControl
        onToggleIgnore={(ignored) => onChange({ ...form, ignoreAcceptedPerformanceFeedback: ignored })}
      />
      <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm" data-acf-planning-reused-positioning>
        <p className="font-medium">当前账号定位</p>
        <p className="mt-1 text-neutral-700">{positioningSummary || selected?.accountPositioning || "已根据账号定位填写"}</p>
        {selected?.audienceSummary ? <p className="mt-1 text-neutral-600">想给谁看：{selected.audienceSummary}</p> : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">本批补充要求（选填，可自由写）</span>
        <Textarea
          rows={3}
          maxLength={2000}
          disabled={pending}
          value={form.additionalRequirements}
          placeholder="例如：必须提到换季修护，不想出现强促销。"
          onChange={(event) => onChange({ ...form, additionalRequirements: event.target.value })}
        />
      </label>

      <details className="rounded-md border border-neutral-200 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">更多设置</summary>
        <div className="mt-3 space-y-3">
          {positioningOptions.length > 1 ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">如需更换定位版本</span>
              <select
                id="planning-positioning"
                className="acf-field w-full rounded-md border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
                value={form.positioningRunId}
                disabled={pending}
                onChange={(event) => onChange({ ...form, positioningRunId: event.target.value })}
              >
                {positioningOptions.map((option) => (
                  <option key={option.runId} value={option.runId}>
                    {option.accountPositioning}
                    {option.audienceSummary ? ` · ${option.audienceSummary}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input id="planning-positioning" type="hidden" value={form.positioningRunId} readOnly />
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">推广策略（可选）</span>
            <select
              id="planning-strategy"
              className="acf-field w-full rounded-md border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
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
              <p className="mt-2 text-neutral-600">未使用推广策略时，内容计划主要依据账号定位和本次要求生成。</p>
            ) : null}
          </label>
          <p className="text-xs text-neutral-500">默认批次 {PLANNING_DAYS_V1} 条 · 预计生成 {expected} 条内容</p>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !form.positioningRunId} loading={pending}>
          生成内容计划
        </Button>
        {onCancel ? (
          <Button variant="secondary" type="button" disabled={pending} onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}
