import Link from "next/link";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";

export function StagePlaceholder({
  title,
  description,
  projectName,
  status,
  emptyTitle,
  primaryAction,
  secondaryAction,
  legacyHref,
  legacyLabel,
}: {
  title: string;
  description: string;
  projectName: string;
  status: string;
  emptyTitle?: string;
  primaryAction?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
  legacyHref?: string;
  legacyLabel?: string;
}) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        breadcrumb={`项目 / ${projectName} / ${title}`}
      />
      <p className="mb-6 text-sm text-neutral-600">当前状态：{status}</p>
      <EmptyState
        title={emptyTitle ?? `开始${title}`}
        description={description}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      />
      {legacyHref && legacyLabel ? (
        <p className="mt-4 text-sm text-neutral-500">
          现有工具仍可使用：
          <Link className="ml-1 underline" href={legacyHref}>
            {legacyLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
