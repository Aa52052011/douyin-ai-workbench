import type { VideoView } from "../lib/video.types";

export function VideoProgress({ view }: { view: VideoView }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-medium">当前进度</h3>
      <p className="mt-1 text-sm text-neutral-700" aria-live="polite">
        {view.currentStageLabel}
        {view.progressPercent != null ? ` · ${view.progressPercent}%` : ""}
      </p>
      <ol className="mt-3 flex flex-wrap gap-2 text-sm">
        {view.stages.map((stage) => (
          <li
            key={stage.key}
            className={
              stage.state === "done"
                ? "rounded-full bg-neutral-100 px-3 py-1 text-neutral-800"
                : stage.state === "current"
                  ? "rounded-full bg-neutral-950 px-3 py-1 text-white"
                  : stage.state === "failed"
                    ? "rounded-full bg-red-50 px-3 py-1 text-red-700"
                    : "rounded-full border border-neutral-200 px-3 py-1 text-neutral-400"
            }
          >
            {stage.state === "done" ? "✓ " : stage.state === "current" ? "→ " : stage.state === "failed" ? "! " : "○ "}
            {stage.label.replace(/^正在/, "").replace(/^已/, "已")}
          </li>
        ))}
      </ol>
    </section>
  );
}
