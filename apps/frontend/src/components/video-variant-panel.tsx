export function VideoVariantPanelV4({
  portrait,
  onSelect,
  selected,
}: {
  portrait: boolean;
  selected: "vertical" | "landscape";
  onSelect: (next: "vertical" | "landscape") => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm" data-acf-video-variant>
      <p className="font-medium">成片版本</p>
      <p className="acf-caption mt-1">抖音推荐版本：竖版。这不是已经发布。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 ${selected === "vertical" ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
          onClick={() => onSelect("vertical")}
        >
          竖版视频{portrait ? " · 当前" : ""}
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 ${selected === "landscape" ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
          onClick={() => onSelect("landscape")}
        >
          横版视频
        </button>
      </div>
    </section>
  );
}
