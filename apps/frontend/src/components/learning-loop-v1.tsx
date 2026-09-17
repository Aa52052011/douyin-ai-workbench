export function LearningLoopV1({ highlight }: { highlight: "decision" | "planning" | "review" }) {
  const steps = [
    { id: "publish", label: "发布" },
    { id: "data", label: "数据" },
    { id: "review", label: "AI复盘" },
    { id: "decision", label: "你的决定" },
    { id: "planning", label: "下一轮规划" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" data-acf-learning-loop-v1 aria-label="学习循环">
      {steps.map((step, index) => {
        const current = (highlight === "decision" && step.id === "decision") || (highlight === "planning" && step.id === "planning") || (highlight === "review" && step.id === "review");
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 ? <span className="acf-caption">→</span> : null}
            <span className={current ? "font-medium" : "acf-caption"}>
              {step.label}
              {current ? " / 已完成" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
