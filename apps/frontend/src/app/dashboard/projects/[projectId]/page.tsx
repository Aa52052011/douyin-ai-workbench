"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "../../../../components/page-header";
import { StageChecklist } from "../../../../components/stage-checklist";
import { isNotFoundError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { loadProjectStatus, type ProjectStatusSnapshot } from "../../../../lib/load-project-status";
import { fullLoopCtaNote, groupProgress, stageCountLabel } from "../../../../lib/project-next-action";
import { useProjectWorkspace } from "../../../../lib/project-workspace-context";

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState<ProjectStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void loadProjectStatus(accessToken, projectId)
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(isNotFoundError(err) ? "项目不存在或你没有访问权限" : err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  if (error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }
  if (!snapshot) {
    return <p className="text-sm text-neutral-600">正在整理项目进度…</p>;
  }

  const groups = groupProgress(snapshot.stages);
  const meta = [project.industry, project.platform].filter(Boolean).join(" · ");
  const summary = snapshot.summary;
  const summaryItems = [
    summary.productName ? `当前产品：${summary.productName}` : "",
    summary.positioningLine ? `当前定位：${summary.positioningLine}` : "",
    summary.strategyObjective ? `推广目标：${summary.strategyObjective}` : "",
    summary.planTitle ? `最新计划：${summary.planTitle}${summary.planStatus ? `（${summary.planStatus}）` : ""}` : "",
    summary.scriptTitle ? `最新脚本：${summary.scriptTitle}${summary.scriptStatus ? `（${summary.scriptStatus}）` : ""}` : "",
    summary.videoStatus ? `最新视频：${summary.videoStatus}` : "",
    summary.publicationTitle ? `最近发布：${summary.publicationTitle}` : "",
    summary.hasMetrics ? "已有表现数据" : "",
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        title="项目概览"
        description="这个项目现在做到哪一步，下一步该做什么。"
        breadcrumb={`项目 / ${project.name} / 概览`}
      />

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-600">{meta || "未填写行业 / 平台"}</p>
        {project.description ? <p className="mt-2 text-sm">{project.description}</p> : null}
        <p className="mt-3 text-sm text-neutral-700">{stageCountLabel(snapshot.stages)}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {groups.map((group) => `${group.label} ${group.done}/${group.total}`).join(" · ")}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">阶段进度</h2>
          <StageChecklist projectId={projectId} stages={snapshot.stages} />
        </section>
        <aside className="space-y-4">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-medium">下一步</h2>
            <p className="mt-2 text-sm text-neutral-600">{snapshot.nextAction.label}</p>
            {snapshot.nextAction.id === "next-plan" ? (
              <p className="mt-2 text-xs text-neutral-500">{fullLoopCtaNote()}</p>
            ) : null}
            <Link
              className="mt-4 inline-flex rounded-md bg-neutral-950 px-4 py-2 text-sm text-white"
              href={snapshot.nextAction.href}
            >
              {snapshot.nextAction.label}
            </Link>
          </section>
          {summaryItems.length > 0 ? (
            <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
              {summaryItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
