"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/ux/cn";

const variants = {
  primary:
    "bg-[var(--acf-brand)] text-white hover:bg-[var(--acf-brand-hover)] disabled:bg-[var(--acf-text-disabled)]",
  secondary:
    "border border-[var(--acf-border-strong)] bg-[var(--acf-surface)] text-[var(--acf-text)] hover:bg-[var(--acf-surface-subtle)]",
  ghost: "text-[var(--acf-text-secondary)] hover:bg-[var(--acf-surface-subtle)]",
  danger: "bg-[var(--acf-danger)] text-white",
} as const;

const sizes = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
} as const;

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-9 items-center justify-center rounded-[var(--acf-radius-sm)] disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? "处理中…" : children}
    </button>
  );
}
