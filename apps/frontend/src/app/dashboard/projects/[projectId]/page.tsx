"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NextActionCard } from "../../../../components/next-action-card";
import { WorkflowPageHeaderV1 } from "../../../../components/workflow-page-header-v1";
import { ContextReuseSummary } from "../../../../components/publication-data-hub";
import { Card } from "../../../../components/ui/card";
import { Skeleton } from "../../../../components/ui/feedback";
import { InlineActionErrorV1 } from "../../../../components/inline-action-error-v1";
import { isNotFoundError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { loadProjectStatus, type ProjectStatusSnapshot } from "../../../../lib/load-project-status";
import { resolveNextActionV2 } from "../../../../lib/ux/next-action-v2";
import { currentWorkStageCopy, cycleProgressRows } from "../../../../lib/ux/cycle-progress";
import { useProjectWorkspace } from "../../../../lib/project-workspace-context";
import { projectPlatformLabel } from "../../../../lib/project-platform";
import { withIntakeDraftNextAction } from "../../../../lib/with-intake-draft-next-action";
import { formatDisplayDateTime } from "../../../../lib/ui-labels";

function routeProjectId(projectId: string | string[] | undefined): string {
  if (Array.isArray(projectId)) {
    return projectId[0] ?? "";
  }
  return typeof projectId === "string" ? projectId : "";
}

export default function ProjectOverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = routeProjectId(params?.projectId);
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState<ProjectStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!accessToken || !projectId) return;
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    void loadProjectStatus(accessToken, projectId)
      .then((data) => {
        if (!cancelled) setSnapshot(withIntakeDraftNextAction(projectId, data));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(isNotFoundError(err) ? "项目不存在或你没有访问权限" : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, reloadKey]);

  if (error) {
    return (
      <InlineActionErrorV1
        message="无法加载项目概览。请重试，已填写的信息不会丢失。"
        technicalDetails={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }
  if (!snapshot) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const next = resolveNextActionV2(projectId, snapshot.facts);
  const displayProject = project.id === snapshot.project.id && project.name ? project : snapshot.project;
  const platformLabel = projectPlatformLabel(displayProject.platform);
  const stageLabel = currentWorkStageCopy(projectId, snapshot.facts);
  const progress = cycleProgressRows(snapshot.facts);
  const recent = snapshot.facts.recentTopics ?? [];
  const industry = displayProject.industry?.trim();

  return (
    <div>
      <WorkflowPageHeaderV1
        page="project-overview"
        projectId={projectId}
        title="项目概览"
        description="查看当前进展，并继续下一步。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: displayProject.name, href: `/dashboard/projects/${projectId}` },
          { label: "概览" },
        ]}
      />

      <NextActionCard action={next} stageLabel={stageLabel} />

      <div className="xl:grid xl:grid-cols-2 xl:gap-6">
      <section className="mb-6">
        <h2 className="acf-section-title mb-3">本期进度</h2>
        <Card variant="summary">
          <ul className="space-y-2">
            {progress.map((row) => (
              <li key={row.label} className="flex justify-between gap-4 text-sm">
                <span className="text-[var(--acf-text-secondary)]">{row.label}</span>
                <span>{row.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mb-6">
        <h2 className="acf-section-title mb-3">最近内容</h2>
        {recent.length === 0 ? (
          <p className="acf-body-secondary">确认内容计划后，这里会列出最近的选题。</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li key={item.topicId || item.title}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="acf-card-title">{item.title}</p>
                      <p className="acf-caption mt-0.5">{item.statusLabel}</p>
                    </div>
                    <Link className="mt-0.5 shrink-0 text-sm underline" href={item.href}>
                      继续 →
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>

      <details className="mb-6 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface-muted)] p-4">
        <summary className="cursor-pointer text-sm font-medium">项目资料</summary>
        <p className="acf-body-secondary mt-3">目标平台：{platformLabel}</p>
        {industry ? <p className="acf-body-secondary mt-1">行业：{industry}</p> : null}
        <p className="acf-caption mt-1">创建时间：{formatDisplayDateTime(displayProject.createdAt)}</p>
        <div className="mt-4">
          <ContextReuseSummary
            positioningLine={snapshot.summary.positioningLine}
            audience={snapshot.summary.targetAudience}
            style={snapshot.summary.contentStyle}
            platform={platformLabel}
            duration={snapshot.summary.recommendedLength}
            editHref={`/dashboard/projects/${projectId}/positioning`}
          />
        </div>
        <Link className="mt-3 inline-block text-sm underline" href={`/dashboard/projects/${projectId}/product`}>
          查看或编辑项目资料
        </Link>
      </details>
    </div>
  );
}
