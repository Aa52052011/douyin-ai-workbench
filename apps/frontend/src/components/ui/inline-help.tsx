"use client";

export function InlineHelpV1({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-[var(--acf-border)] text-xs text-[var(--acf-text-secondary)]"
        aria-label={label}
        title={text}
      >
        ?
      </button>
    </span>
  );
}
