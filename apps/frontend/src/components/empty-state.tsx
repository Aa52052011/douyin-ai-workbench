import Link from "next/link";

type Action = { label: string; href?: string; onClick?: () => void };

function ActionControl({ action, variant }: { action: Action; variant: "primary" | "secondary" }) {
  const className =
    variant === "primary"
      ? "rounded-md bg-neutral-950 px-4 py-2 text-sm text-white"
      : "rounded-md border border-neutral-300 px-4 py-2 text-sm";
  if (action.onClick) {
    return (
      <button className={className} type="button" onClick={action.onClick}>
        {action.label}
      </button>
    );
  }
  if (action.href) {
    return (
      <Link className={className} href={action.href}>
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
}: {
  title: string;
  description: string;
  primaryAction?: Action;
  secondaryAction?: Action;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">{description}</p>
      <div className="mt-5 flex justify-center gap-3">
        {primaryAction ? <ActionControl action={primaryAction} variant="primary" /> : null}
        {secondaryAction ? <ActionControl action={secondaryAction} variant="secondary" /> : null}
      </div>
    </div>
  );
}
