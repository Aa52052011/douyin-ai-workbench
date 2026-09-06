import type { ResearchOptionView } from "../lib/market-analysis.types";

export function MarketAnalysisResearchSelector({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ResearchOptionView[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <label className="mb-2 block text-sm font-medium" htmlFor="market-analysis-research">
        选择一份市场调研
      </label>
      <select
        id="market-analysis-research"
        className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.ordinalLabel} · {option.kindLabel} · 样本 {option.sampleCount} 条
            {option.qualityLabel ? ` · ${option.qualityLabel}` : ""}
            {option.createdAtLabel ? ` · ${option.createdAtLabel}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
