export function PerformanceTabs({
  tab,
  onChange,
}: {
  tab: "metrics" | "advice";
  onChange: (tab: "metrics" | "advice") => void;
}) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="数据优化">
      <button
        className={`rounded-md px-4 py-2 text-sm ${tab === "metrics" ? "bg-neutral-950 text-white" : "border"}`}
        type="button"
        role="tab"
        aria-selected={tab === "metrics"}
        onClick={() => onChange("metrics")}
      >
        表现
      </button>
      <button
        className={`rounded-md px-4 py-2 text-sm ${tab === "advice" ? "bg-neutral-950 text-white" : "border"}`}
        type="button"
        role="tab"
        aria-selected={tab === "advice"}
        onClick={() => onChange("advice")}
      >
        优化建议
      </button>
    </div>
  );
}
