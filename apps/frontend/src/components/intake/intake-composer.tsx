import { useState } from "react";

export function IntakeComposer({
  disabled,
  onSend,
  placeholder = "先简单说说你的产品…",
  inputId = "product-intake-composer",
}: {
  disabled?: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
  inputId?: string;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const next = value.trim();
    if (!next || disabled) {
      return;
    }
    onSend(next);
    setValue("");
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-2 border-t border-neutral-200 pt-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        输入你的回答
      </label>
      <textarea
        id={inputId}
        className="min-h-20 min-w-0 flex-1 resize-y rounded-md border border-neutral-300 px-3 py-2 text-sm"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="输入你的回答"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
        type="submit"
        disabled={disabled || !value.trim()}
      >
        发送
      </button>
    </form>
  );
}
