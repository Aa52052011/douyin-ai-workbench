export function VideoVariantPanelV4({
  portrait,
  onSelect,
  selected,
  landscapeAvailable,
}: {
  portrait: boolean;
  selected: "vertical" | "landscape";
  onSelect: (next: "vertical" | "landscape") => void;
  landscapeAvailable: boolean;
}) {
  return (
    <section className="text-sm" data-acf-video-variant role="tablist" aria-label="画面比例">
      <p className="font-medium">画面比例</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={selected === "vertical"}
          className={`rounded-[var(--acf-radius-sm)] border px-3 py-1.5 ${selected === "vertical" ? "border-[var(--acf-text)] bg-[var(--acf-surface-muted)]" : ""}`}
          onClick={() => onSelect("vertical")}
        >
          竖版 9:16{portrait && selected === "vertical" ? " · 当前" : ""}
        </button>
        {landscapeAvailable ? (
          <button
            type="button"
            role="tab"
            aria-selected={selected === "landscape"}
            className={`rounded-[var(--acf-radius-sm)] border px-3 py-1.5 ${selected === "landscape" ? "border-[var(--acf-text)] bg-[var(--acf-surface-muted)]" : ""}`}
            onClick={() => onSelect("landscape")}
          >
            横版 16:9
          </button>
        ) : null}
      </div>
    </section>
  );
}
