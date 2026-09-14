import type { ReactNode } from "react";
import { cn } from "../../lib/ux/cn";

export function HelperText({ children }: { children: ReactNode }) {
  return <p className="acf-caption mt-1">{children}</p>;
}

export function FormField({
  label,
  htmlFor,
  required,
  optional,
  description,
  error,
  helper,
  sourceHint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  description?: string;
  error?: string;
  helper?: string;
  sourceHint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="acf-label" htmlFor={htmlFor}>
          {label}
        </label>
        {required ? <span className="acf-caption text-[var(--acf-danger)]">必填</span> : null}
        {optional && !required ? <span className="acf-caption">选填</span> : null}
      </div>
      {description ? <p className="acf-caption">{description}</p> : null}
      {sourceHint ? <p className="acf-caption">{sourceHint}</p> : null}
      {children}
      {helper ? <HelperText>{helper}</HelperText> : null}
      {error ? (
        <p className="text-xs text-[var(--acf-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const cls = {
    info: "bg-[var(--acf-info-subtle)] text-[var(--acf-info)]",
    warning: "bg-[var(--acf-warning-subtle)] text-[var(--acf-warning)]",
    danger: "bg-[var(--acf-danger-subtle)] text-[var(--acf-danger)]",
    success: "bg-[var(--acf-success-subtle)] text-[var(--acf-success)]",
  }[tone];
  return <div className={cn("rounded-[var(--acf-radius-sm)] px-3 py-2 text-sm", cls)}>{children}</div>;
}
