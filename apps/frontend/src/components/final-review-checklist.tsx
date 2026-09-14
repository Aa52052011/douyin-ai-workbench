"use client";

import { useState } from "react";

const ITEMS = [
  { id: "picture", label: "画面是否正常" },
  { id: "audio", label: "声音是否正常" },
  { id: "subtitle", label: "字幕/文字是否清楚" },
  { id: "pacing", label: "节奏是否合适" },
  { id: "intent", label: "内容是否符合预期" },
] as const;

export function FinalReviewChecklistV4() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4" data-acf-final-review-checklist>
      <h2 className="text-sm font-medium">审核时可以对照看</h2>
      <p className="acf-caption mt-1">这是给你自己用的清单，不会代替确认通过。</p>
      <ul className="mt-3 space-y-2 text-sm">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(checked[item.id])}
                onChange={(event) => setChecked((current) => ({ ...current, [item.id]: event.target.checked }))}
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
