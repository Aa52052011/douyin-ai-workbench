import Link from "next/link";
import { Button } from "./ui/button";

type Action = { label: string; href?: string; onClick?: () => void };

function ActionControl({ action, variant }: { action: Action; variant: "primary" | "secondary" }) {
  if (action.onClick) {
    return (
      <Button type="button" variant={variant === "primary" ? "primary" : "secondary"} className="min-h-9" onClick={action.onClick}>
        {action.label}
      </Button>
    );
  }
  if (action.href) {
    return (
      <Link
        className={
          variant === "primary"
            ? "inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-brand)] bg-[var(--acf-brand)] px-4 py-2 text-sm font-medium text-[var(--acf-text-inverse)]"
            : "inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] bg-[var(--acf-surface)] px-4 py-2 text-sm font-medium text-[var(--acf-brand)]"
        }
        href={action.href}
      >
        {action.label}
      </Link>
    );
  }
  return null;
}

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  compact,
}: {
  title: string;
  description: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "mx-auto max-w-md rounded-[var(--acf-radius-md)] border border-dashed border-[var(--acf-border-strong)] bg-[var(--acf-surface)] px-5 py-6 text-center"
          : "rounded-[var(--acf-radius-md)] border border-dashed border-[var(--acf-border-strong)] bg-[var(--acf-surface)] px-6 py-10 text-center"
      }
      data-acf-empty-v2
    >
      <h2 className="acf-section-title">{title}</h2>
      <p className="acf-body-secondary mx-auto mt-2 max-w-md">{description}</p>
      <div className={compact ? "mt-4 flex justify-center gap-3" : "mt-6 flex justify-center gap-3"}>
        {primaryAction ? <ActionControl action={primaryAction} variant="primary" /> : null}
        {secondaryAction ? <ActionControl action={secondaryAction} variant="secondary" /> : null}
      </div>
    </div>
  );
}
