"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ContextualGuidanceV1 } from "../../../../components/contextual-guidance-v1";
import { LearningSummaryCard } from "../../../../components/learning-summary-card";
import { NextActionCard } from "../../../../components/next-action-card";
import { PageHeader } from "../../../../components/page-header";
import { ContextReuseSummary } from "../../../../components/publication-data-hub";
import { StageChecklist } from "../../../../components/stage-checklist";
import { WorkflowProgress } from "../../../../components/workflow-progress";
import { Card } from "../../../../components/ui/card";
import { Skeleton } from "../../../../components/ui/feedback";
import { isNotFoundError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { loadProjectStatus, type ProjectStatusSnapshot } from "../../../../lib/load-project-status";
import { getLearningSummary, type LearningPublicView } from "../../../../lib/research.api";
import { resolveNextActionV2 } from "../../../../lib/ux/next-action-v2";
import { resolveWorkflowStagesV2, workflowCurrentLabel } from "../../../../lib/ux/workflow-stages";
import { useProjectWorkspace } from "../../../../lib/project-workspace-context";
import { projectPlatformLabel } from "../../../../lib/project-platform";
import { withIntakeDraftNextAction } from "../../../../lib/with-intake-draft-next-action";

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState<ProjectStatusSnapshot | null>(null);
  const [learning, setLearning] = useState<LearningPublicView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) return;
    let cancelled = false;
    setSnapshot(null);
    setLearning(null);
    void loadProjectStatus(accessToken, projectId)
      .then((data) => {
        if (!cancelled) setSnapshot(withIntakeDraftNextAction(projectId, data));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(isNotFoundError(err) ? "项目不存在或你没有访问权限" : err.message);
      });
    void getLearningSummary(accessToken, projectId)
      .then((data) => {
        if (!cancelled) setLearning(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLearning({
            statusLabel: "数据不足，系统正在积累",
            summary: [],
            nextBatchAdjustments: [],
            dataSufficiency: "INSUFFICIENT_DATA",
            lastUpdatedAt: new Date().toISOString(),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  if (error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        无法加载项目概览。请刷新重试，已填写的信息不会丢失。
      </p>
    );
  }
  if (!snapshot) {
    return <Skeleton className="h-28 w-full" />;
  }

  const next = resolveNextActionV2(projectId, snapshot.facts);
  const stages = resolveWorkflowStagesV2(projectId, snapshot.facts);
  const platformLabel = projectPlatformLabel(project.platform);
  const summary = snapshot.summary;

  return (
    <div>
      <PageHeader
        title="项目概览"
        description={`${workflowCurrentLabel(stages)} · 目标平台：${platformLabel}`}
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "概览" },
        ]}
      />

      <ContextualGuidanceV1 id="dashboard" />

      <NextActionCard action={next} />

      <section className="mb-6">
        <h2 className="acf-section-title mb-3">内容进度</h2>
        <WorkflowProgress stages={stages} />
      </section>

      <div className="mb-6">
        <ContextReuseSummary
          positioningLine={summary.positioningLine}
          audience={summary.targetAudience}
          style={summary.contentStyle}
          platform={platformLabel}
          duration={summary.recommendedLength}
          editHref={`/dashboard/projects/${projectId}/positioning`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <details className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium">详细资料进度</summary>
          <div className="mt-3">
            <StageChecklist projectId={projectId} stages={snapshot.stages} />
          </div>
        </details>
        <aside className="space-y-4">
          <Card>
            <h2 className="acf-section-title">最近内容</h2>
            <p className="acf-body-secondary mt-2">{summary.planTitle ? `内容计划：${summary.planTitle}` : "还没有内容计划。"}</p>
            <p className="acf-body-secondary mt-1">{summary.scriptTitle ? `最新脚本：${summary.scriptTitle}` : "还没有脚本。"}</p>
            <p className="acf-body-secondary mt-1">{summary.videoStatus ? `成片：${summary.videoStatus}` : "还没有成片。"}</p>
          </Card>
          <Card>
            <h2 className="acf-section-title">发布与数据</h2>
            <p className="acf-body-secondary mt-2">{summary.publicationTitle ? `最近发布：${summary.publicationTitle}` : "完成成片后即可手动发布。"}</p>
            <p className="acf-body-secondary mt-1">{summary.hasMetrics ? "已有表现数据，可开始AI复盘。" : "登记作品并录入数据后才会出现复盘。"}</p>
            <Link className="mt-3 inline-block text-sm underline" href={`/dashboard/projects/${projectId}/publish`}>
              打开发布与数据
            </Link>
          </Card>
          <LearningSummaryCard learning={learning} />
        </aside>
      </div>
    </div>
  );
}
