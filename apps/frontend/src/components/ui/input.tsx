import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/ux/cn";

const fieldClass =
  "acf-field w-full rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm text-[var(--acf-text)] placeholder:text-[var(--acf-text-muted)] focus-visible:border-[var(--acf-brand)] disabled:bg-[var(--acf-surface-muted)] disabled:text-[var(--acf-text-disabled)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-4 w-4 accent-[var(--acf-brand)]", className)} type="checkbox" {...props} />;
}

export function Radio({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-4 w-4 accent-[var(--acf-brand)]", className)} type="radio" {...props} />;
}
