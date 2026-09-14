import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="acf-caption mb-1" aria-label="面包屑">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden>/</span> : null}
              {item.href && !last ? (
                <Link className="inline-flex min-h-9 items-center underline-offset-2 hover:underline" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
