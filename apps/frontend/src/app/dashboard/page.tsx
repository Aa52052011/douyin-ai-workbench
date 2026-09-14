"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateProjectForm } from "../../components/create-project-form";
import { FirstRunOnboardingV1 } from "../../components/first-run-onboarding-v1";
import { ContextualGuidanceV1 } from "../../components/contextual-guidance-v1";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { ResumeWorkCard, TaskCenter } from "../../components/task-center";
import { Card } from "../../components/ui/card";
import { ProductErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/feedback";
import { WorkflowProgress } from "../../components/workflow-progress";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { readLastProjectId } from "../../lib/last-project";
import { loadProjectStatus } from "../../lib/load-project-status";
import type { Project } from "../../lib/types";
import { collectProjectTask, dedupeTasks, primaryTask, type TaskItemV2 } from "../../lib/ux/task-center";
import { resolveWorkflowStagesV2, workflowCurrentLabel } from "../../lib/ux/workflow-stages";
import { toProductError } from "../../lib/ux/product-error";
import { withIntakeDraftNextAction } from "../../lib/with-intake-draft-next-action";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { projectPlatformLabel } from "../../lib/project-platform";

const LOAD_LIMIT = 8;

type LoadedProject = {
  project: Project;
  task: TaskItemV2;
  stageLabel: string;
  stages: ReturnType<typeof resolveWorkflowStagesV2>;
};

export default function DashboardPage() {
  const { session, accessToken } = useAuth();
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedProject[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void api<Project[]>("/projects", { accessToken })
      .then(async (projects) => {
        const recent = [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, LOAD_LIMIT);
        const rows: LoadedProject[] = [];
        for (const project of recent) {
          try {
            const snapshot = withIntakeDraftNextAction(project.id, await loadProjectStatus(accessToken, project.id));
            rows.push({
              project: snapshot.project,
              task: collectProjectTask(snapshot.project, snapshot.facts),
              stages: resolveWorkflowStagesV2(project.id, snapshot.facts),
              stageLabel: workflowCurrentLabel(resolveWorkflowStagesV2(project.id, snapshot.facts)),
            });
          } catch {
            /* skip projects whose status cannot be loaded — no fake tasks */
          }
        }
        if (!cancelled) {
          setLoaded(rows);
          setLastId(readLastProjectId());
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(toProductError(err, "没能加载工作台"));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const tasks = useMemo(() => (loaded ? dedupeTasks(loaded.map((item) => item.task)) : []), [loaded]);
  const primary = primaryTask(tasks);
  const resume = tasks.find((item) => item.projectId === lastId) ?? null;
  const current = loaded?.find((item) => item.project.id === lastId) ?? loaded?.[0] ?? null;

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader
        title="工作台"
        description={`你好，${session?.user.name ?? "创作者"}。这里只显示真实待办，不会编造任务。`}
      />
      {loaded ? <FirstRunOnboardingV1 hasProjects={loaded.length > 0} /> : null}
      {loaded && loaded.length === 0 ? <ContextualGuidanceV1 id="dashboard" /> : null}

      {error ? (
        <div className="mb-4">
          <ProductErrorState title={error.title} humanMessage={error.humanMessage} recoveryAction={error.recoveryAction} technicalDetails={error.technicalDetails} />
        </div>
      ) : null}

      {!loaded ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {loaded && loaded.length === 0 ? (
        <EmptyState
          title="开始创建第一个项目"
          description="创建后系统会带你完成账号定位和第一条内容。这里不会放演示项目或假数据。"
          primaryAction={{ label: "开始创建第一个项目", href: "#create-project" }}
        />
      ) : null}

      {loaded && loaded.length > 0 && primary ? (
        <section className="mb-6">
          <Card className="border-[var(--acf-brand)]">
            <p className="acf-caption">当前最重要的一步</p>
            <p className="acf-card-title mt-1">{primary.title}</p>
            <p className="acf-body-secondary mt-1">
              {primary.projectName} · {primary.type}
            </p>
            <Link
              className="mt-3 inline-flex rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 py-2 text-sm text-white"
              href={primary.href}
            >
              {primary.ctaLabel}
            </Link>
          </Card>
        </section>
      ) : null}

      {resume && primary && resume.id !== primary.id ? (
        <section className="mb-6">
          <ResumeWorkCard task={resume} />
        </section>
      ) : null}

      {current ? (
        <section className="mb-6">
          <Card>
            <p className="acf-section-title">{current.project.name}</p>
            <p className="acf-caption mt-1">
              {projectPlatformLabel(current.project.platform)} · {current.stageLabel}
            </p>
            <div className="mt-3">
              <WorkflowProgress stages={current.stages} />
            </div>
            <Link className="acf-caption mt-3 inline-block underline" href={`/dashboard/projects/${current.project.id}`}>
              打开项目概览
            </Link>
          </Card>
        </section>
      ) : null}

      {loaded && loaded.length > 0 ? (
        <section className="mb-8">
          <h2 className="acf-section-title mb-3">待处理任务</h2>
          <TaskCenter tasks={tasks} primaryId={primary?.id} />
        </section>
      ) : null}

      {loaded && loaded.length > 0 ? (
        <details className="mb-6">
          <summary className="cursor-pointer text-sm text-[var(--acf-text-secondary)]">创建新项目</summary>
          <div id="create-project" className="mt-3">
            {accessToken ? (
              <CreateProjectForm accessToken={accessToken} onCreated={(project) => router.push(`/dashboard/projects/${project.id}`)} />
            ) : null}
          </div>
        </details>
      ) : null}

      {loaded && loaded.length === 0 ? (
        <section id="create-project" className="mt-6">
          {accessToken ? (
            <CreateProjectForm accessToken={accessToken} onCreated={(project) => router.push(`/dashboard/projects/${project.id}`)} />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
