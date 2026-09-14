"use client";

import { useEffect, useState } from "react";
import { CONTEXTUAL_GUIDANCE, guidanceStorageKey } from "../lib/ux/onboarding-v1";
import { Button } from "./ui/button";

export function ContextualGuidanceV1({
  id,
}: {
  id: keyof typeof CONTEXTUAL_GUIDANCE;
}) {
  const copy = CONTEXTUAL_GUIDANCE[id];
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setReady(true);
    setHidden(window.localStorage.getItem(guidanceStorageKey(id)) === "1");
  }, [id]);

  if (!copy || !ready || hidden) return null;

  return (
    <aside className="mb-4 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface-subtle)] p-3" data-acf-contextual-guidance-v1>
      <p className="acf-section-title">{copy.title}</p>
      <p className="acf-body mt-1">{copy.body}</p>
      <p className="acf-caption mt-1">下一步：{copy.next}</p>
      <Button
        className="mt-2 min-h-9"
        size="sm"
        variant="ghost"
        type="button"
        onClick={() => {
          window.localStorage.setItem(guidanceStorageKey(id), "1");
          setHidden(true);
        }}
      >
        收起说明
      </Button>
    </aside>
  );
}
