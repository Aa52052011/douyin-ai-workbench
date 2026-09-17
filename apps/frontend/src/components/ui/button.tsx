"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/ux/cn";

const variants = {
  primary:
    "border border-[var(--acf-brand)] bg-[var(--acf-brand)] font-medium text-[var(--acf-text-inverse)] hover:border-[var(--acf-brand-hover)] hover:bg-[var(--acf-brand-hover)] active:border-[var(--acf-brand-active)] active:bg-[var(--acf-brand-active)] disabled:border-[var(--acf-text-disabled)] disabled:bg-[var(--acf-text-disabled)] disabled:text-[var(--acf-surface)]",
  secondary:
    "border border-[var(--acf-border-strong)] bg-[var(--acf-surface)] font-medium text-[var(--acf-brand)] hover:bg-[var(--acf-brand-soft)]",
  ghost: "text-[var(--acf-text-secondary)] hover:bg-[var(--acf-brand-soft)] hover:text-[var(--acf-brand)]",
  danger: "bg-[var(--acf-danger)] text-[var(--acf-text-inverse)]",
} as const;

const sizes = {
  sm: "min-h-8 px-2.5 py-1 text-xs",
  md: "min-h-9 px-3 py-1.5 text-sm",
  lg: "min-h-10 px-4 py-2 text-sm",
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
        "inline-flex items-center justify-center rounded-[var(--acf-radius-sm)] shadow-none transition-colors duration-[var(--acf-motion)] disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={type}
      {...props}
    >
      {loading ? "处理中…" : children}
    </button>
  );
}
