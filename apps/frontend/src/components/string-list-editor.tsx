import { useState } from "react";

export function StringListEditor({
  id,
  label,
  items,
  onChange,
  maxItems,
  maxItemLength,
  placeholder,
  error,
  disabled,
}: {
  id: string;
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  maxItems: number;
  maxItemLength: number;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const errorId = `${id}-error`;

  function add() {
    const next = draft.trim();
    if (!next || disabled) {
      return;
    }
    if (next.length > maxItemLength || items.length >= maxItems || items.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...items, next]);
    setDraft("");
  }

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          id={id}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={draft}
          maxLength={maxItemLength}
          placeholder={placeholder}
          disabled={disabled || items.length >= maxItems}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button className="rounded-md border px-3 py-2 text-sm" type="button" disabled={disabled} onClick={add}>
          添加
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className="flex max-w-full items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-xs">
              <span className="break-all">{item}</span>
              <button
                className="text-neutral-500"
                type="button"
                disabled={disabled}
                aria-label={`删除${label} ${item}`}
                onClick={() => onChange(items.filter((value) => value !== item))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-neutral-500">最多 {maxItems} 项</p>
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
