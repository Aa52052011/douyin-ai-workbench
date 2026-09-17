"use client";

import { useEffect, useState } from "react";
import { POSITIONING_FIRST_STEP_COPY, positioningFirstStepStorageKey } from "../lib/ux/onboarding-v1";
import { Button } from "./ui/button";

export function PositioningFirstStepNotice({ projectId }: { projectId: string }) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setReady(true);
    setHidden(window.localStorage.getItem(positioningFirstStepStorageKey(projectId)) === "1");
  }, [projectId]);

  if (!ready || hidden) return null;

  return (
    <aside
      className="mb-4 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface-subtle)] p-3"
      data-acf-positioning-first-step-notice
    >
      <p className="acf-section-title">{POSITIONING_FIRST_STEP_COPY.title}</p>
      <p className="acf-body mt-1">{POSITIONING_FIRST_STEP_COPY.body}</p>
      <Button
        className="mt-2 min-h-9"
        size="sm"
        variant="ghost"
        type="button"
        onClick={() => {
          window.localStorage.setItem(positioningFirstStepStorageKey(projectId), "1");
          setHidden(true);
        }}
      >
        知道了
      </Button>
    </aside>
  );
}
