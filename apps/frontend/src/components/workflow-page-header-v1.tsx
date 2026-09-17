import type { ReactNode } from "react";
import { PageHeader } from "./page-header";
import type { Crumb } from "./ui/breadcrumb";
import { WorkflowBackNavV1 } from "./workflow-back-nav-v1";
import type { WorkflowBackPage } from "../lib/ux/workflow-back-nav";

export function WorkflowPageHeaderV1({
  page,
  projectId,
  publicationId,
  title,
  description,
  status,
  actions,
  breadcrumb,
  compact,
}: {
  page?: WorkflowBackPage;
  projectId?: string;
  publicationId?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: Crumb[];
  compact?: boolean;
}) {
  return (
    <header data-acf-workflow-page-header-v1>
      {page ? <WorkflowBackNavV1 page={page} projectId={projectId} publicationId={publicationId} /> : null}
      <PageHeader title={title} description={description} status={status} actions={actions} breadcrumb={breadcrumb} className={compact ? "mb-2" : undefined} />
    </header>
  );
}
