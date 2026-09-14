"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open?: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open === false) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panelRef.current;
    const focusable = node?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (open === false) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[color-mix(in_srgb,var(--acf-text)_30%,transparent)] p-4 sm:items-center" role="presentation">
      <div
        ref={panelRef}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[var(--acf-radius-md)] bg-[var(--acf-surface)] p-4 shadow-[var(--acf-shadow)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="acf-section-title">
              {title}
            </h2>
            {description ? <p className="acf-caption mt-1">{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" className="min-h-9 min-w-9" onClick={onClose} type="button" aria-label="关闭对话框">
            关闭
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
