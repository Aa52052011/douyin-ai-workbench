"use client";

import { useState, type ReactNode } from "react";

export function TechnicalDetailsPanel({
  details,
  children,
  title = "技术详情",
}: {
  details?: string;
  children?: ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const body = children ?? details;
  if (!body) return null;
  return (
    <details
      className="acf-caption mt-3"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      data-acf-technical-details
    >
      <summary className="cursor-pointer">{title}</summary>
      {typeof body === "string" ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{body}</pre> : <div className="mt-2">{body}</div>}
    </details>
  );
}
