import type { ReactNode } from "react";
import { cn } from "../lib/ux/cn";
import { Breadcrumb, type Crumb } from "./ui/breadcrumb";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  status,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string | Crumb[];
  status?: ReactNode;
  className?: string;
}) {
  const crumbs: Crumb[] | null = Array.isArray(breadcrumb)
    ? breadcrumb
    : breadcrumb
      ? breadcrumb.split(" / ").map((label) => ({ label }))
      : null;

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className ?? "mb-6")}>
      <div>
        {crumbs ? <Breadcrumb items={crumbs} /> : null}
        <h1 className="acf-page-title">{title}</h1>
        {description ? <p className="acf-body-secondary mt-1 max-w-2xl">{description}</p> : null}
        {status ? <div className="mt-2">{status}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="acf-section-title">{title}</h2>
      {description ? <p className="acf-caption mt-1">{description}</p> : null}
    </div>
  );
}
