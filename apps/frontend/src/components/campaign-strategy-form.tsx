import Link from "next/link";
import type { InsightOptionView, PositioningOptionView, StrategyFormState } from "../lib/campaign-strategy.types";
import { marketAnalysisHref } from "../lib/campaign-strategy.form";

export function CampaignStrategyForm({
  projectId,
  form,
  positioningOptions,
  researchOptions,
  insightOptions,
  pending,
  noMarketHint,
  onChange,
  onSubmit,
  onCancel,
}: {
  projectId: string;
  form: StrategyFormState;
  positioningOptions: PositioningOptionView[];
  researchOptions: Array<{ id: string; label: string }>;
  insightOptions: InsightOptionView[];
  pending: boolean;
  noMarketHint: boolean;
  onChange: (next: StrategyFormState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const insightsForResearch = insightOptions.filter((item) => item.researchId === form.marketResearchId);

  return (
    <form
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm text-neutral-600">你本次填写的目标会优先于系统已有建议。</p>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="strategy-positioning">
          账号定位
        </label>
        <select
          id="strategy-positioning"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={form.positioningRunId}
          disabled={pending}
          onChange={(event) => onChange({ ...form, positioningRunId: event.target.value })}
        >
          {positioningOptions.map((option) => (
            <option key={option.runId} value={option.runId}>
              {option.accountPositioning}
              {option.createdAtLabel ? ` · ${option.createdAtLabel}` : ""}
              {option.audienceSummary ? ` · ${option.audienceSummary}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="strategy-research">
          市场分析
        </label>
        <select
          id="strategy-research"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={form.marketResearchId}
          disabled={pending}
          onChange={(event) =>
            onChange({
              ...form,
              marketResearchId: event.target.value,
              marketInsightId: "",
            })
          }
        >
          <option value="">不使用市场分析</option>
          {researchOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {form.marketResearchId ? (
          <label className="mt-2 block text-sm" htmlFor="strategy-insight">
            <span className="mb-1 block text-neutral-600">选择该调研的市场分析</span>
            <select
              id="strategy-insight"
              className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={form.marketInsightId}
              disabled={pending}
              onChange={(event) => onChange({ ...form, marketInsightId: event.target.value })}
            >
              <option value="">不使用这份调研的分析</option>
              {insightsForResearch.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.insightLabel}
                  {option.confidenceLabel ? ` · ${option.confidenceLabel}` : ""}
                  {option.summary ? ` · ${option.summary}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {noMarketHint ? (
          <p className="mt-2 text-sm text-neutral-600">
            没有市场分析时，策略主要依据产品信息和账号定位，可信度会更低。
            <Link className="ml-2 underline" href={marketAnalysisHref(projectId)}>
              去做市场分析
            </Link>
          </p>
        ) : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">本次推广目标（可选）</span>
        <textarea
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          maxLength={500}
          disabled={pending}
          value={form.userGoal}
          placeholder="先做品牌认知和内容验证，不做强转化"
          onChange={(event) => onChange({ ...form, userGoal: event.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">特别关注（可选）</span>
        <textarea
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          maxLength={500}
          disabled={pending}
          value={form.focus}
          placeholder="更关注新用户教育内容"
          onChange={(event) => onChange({ ...form, focus: event.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">补充限制（可选）</span>
        <textarea
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
          maxLength={1000}
          disabled={pending}
          value={form.constraints}
          placeholder="不要使用绝对化功效表述"
          onChange={(event) => onChange({ ...form, constraints: event.target.value })}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
          type="submit"
          disabled={pending || !form.positioningRunId}
        >
          生成推广策略
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
