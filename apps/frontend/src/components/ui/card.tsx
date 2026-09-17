import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/ux/cn";

const variants = {
  standard: "border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 shadow-[var(--acf-shadow-subtle)]",
  summary: "border border-[var(--acf-border-subtle)] bg-[var(--acf-surface-muted)] p-4",
  action: "border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 shadow-[var(--acf-shadow-subtle)]",
  status: "border border-[var(--acf-border-subtle)] bg-[var(--acf-surface-muted)] px-4 py-3",
} as const;

export function Card({
  className,
  variant = "standard",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof variants }) {
  return (
    <div className={cn("rounded-[var(--acf-radius-md)]", variants[variant], className)} {...props} />
  );
}

export const StandardCard = Card;
export function SummaryCard(props: HTMLAttributes<HTMLDivElement>) {
  return <Card variant="summary" {...props} />;
}
export function ActionCard(props: HTMLAttributes<HTMLDivElement>) {
  return <Card variant="action" {...props} />;
}
export function StatusCard(props: HTMLAttributes<HTMLDivElement>) {
  return <Card variant="status" {...props} />;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="acf-card-title">{children}</h2>;
}
