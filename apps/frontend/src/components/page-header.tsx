import type { ReactNode } from "react";
import { Breadcrumb, type Crumb } from "./ui/breadcrumb";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string | Crumb[];
}) {
  const crumbs: Crumb[] | null = Array.isArray(breadcrumb)
    ? breadcrumb
    : breadcrumb
      ? breadcrumb.split(" / ").map((label) => ({ label }))
      : null;

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        {crumbs ? <Breadcrumb items={crumbs} /> : null}
        <h1 className="acf-page-title">{title}</h1>
        {description ? <p className="acf-body-secondary mt-1 max-w-2xl">{description}</p> : null}
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
