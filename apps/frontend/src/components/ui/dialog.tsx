"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

export function Dialog({
  open = false,
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
  const isOpen = open === true;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panelRef.current;
    const focusable = node?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )].filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color-mix(in_srgb,var(--acf-text)_30%,transparent)] p-4 sm:items-center"
      role="presentation"
      data-acf-dialog-overlay
    >
      <div
        ref={panelRef}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[var(--acf-radius-md)] bg-[var(--acf-surface-elevated)] p-4 shadow-[var(--acf-shadow)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-acf-dialog-panel
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
