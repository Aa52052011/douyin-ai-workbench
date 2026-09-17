"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateProjectForm } from "../../components/create-project-form";
import { FirstRunOnboardingV1 } from "../../components/first-run-onboarding-v1";
import { PageHeader } from "../../components/page-header";
import { ResumeWorkCard, TaskCenter } from "../../components/task-center";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { InlineActionErrorV1 } from "../../components/inline-action-error-v1";
import { Skeleton } from "../../components/ui/feedback";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { readLastProjectId } from "../../lib/last-project";
import { loadProjectStatus } from "../../lib/load-project-status";
import type { Project } from "../../lib/types";
import {
  collectProjectTask,
  continueWorkFor,
  needsAttentionTasks,
  type TaskItemV2,
} from "../../lib/ux/task-center";
import { currentWorkStageCopy } from "../../lib/ux/cycle-progress";
import { createProjectSuccessHref } from "../../lib/ux/create-project-flow";
import { toProductError } from "../../lib/ux/product-error";
import { withIntakeDraftNextAction } from "../../lib/with-intake-draft-next-action";
import { projectPlatformLabel } from "../../lib/project-platform";
import { formatDisplayDateTime } from "../../lib/ui-labels";
import type { ProjectStatusFacts } from "../../lib/project-status";

const RECENT_LIMIT = 5;

type LoadedProject = {
  project: Project;
  task: TaskItemV2;
  facts: ProjectStatusFacts;
  stageLabel: string;
};

export default function DashboardPage() {
  const { session, accessToken } = useAuth();
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedProject[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [projectCount, setProjectCount] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setError(null);
    setLoaded(null);
    void api<Project[]>("/projects", { accessToken })
      .then(async (projects) => {
        const recent = [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, RECENT_LIMIT);
        const rows: LoadedProject[] = [];
        for (const project of recent) {
          try {
            const snapshot = withIntakeDraftNextAction(project.id, await loadProjectStatus(accessToken, project.id));
            rows.push({
              project: snapshot.project,
              facts: snapshot.facts,
              task: collectProjectTask(snapshot.project, snapshot.facts),
              stageLabel: currentWorkStageCopy(project.id, snapshot.facts),
            });
          } catch {
            /* skip projects whose status cannot be loaded — no fake tasks */
          }
        }
        if (!cancelled) {
          setLoaded(rows);
          setLastId(readLastProjectId());
          setProjectCount(projects.length);
          setShowCreate(projects.length === 0);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(toProductError(err, "没能加载工作台"));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, reloadKey]);

  const tasks = useMemo(() => (loaded ? loaded.map((item) => item.task) : []), [loaded]);
  const attention = useMemo(() => needsAttentionTasks(tasks), [tasks]);
  const continueWork = continueWorkFor(tasks, lastId);
  const continueRow = loaded?.find((item) => item.task.id === continueWork?.id) ?? loaded?.[0] ?? null;

  return (
    <main className="min-w-0 px-3 py-4 md:px-4">
      <PageHeader
        className="mb-4"
        title="工作台"
        description={`你好，${session?.user.name ?? "创作者"}。从这里继续未完成的工作。`}
        actions={
          projectCount && projectCount > 0 ? (
            <Button className="min-h-9" type="button" variant="secondary" onClick={() => setShowCreate(true)}>
              创建项目
            </Button>
          ) : null
        }
      />
      {loaded && projectCount !== null ? <FirstRunOnboardingV1 hasProjects={projectCount > 0} /> : null}

      {showCreate || (loaded && loaded.length === 0) ? (
        <Card id="create-project" className="mb-4 p-3" variant="action">
          <h2 className="acf-section-title">创建项目</h2>
          <p className="acf-caption mt-1">创建后会进入账号定位。</p>
          {accessToken ? (
            <div className="mt-3">
              <CreateProjectForm
                accessToken={accessToken}
                submitVariant={loaded && loaded.length > 0 ? "secondary" : "primary"}
                onCreated={(project) => router.push(createProjectSuccessHref(project.id))}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <InlineActionErrorV1
          message={error.humanMessage}
          technicalDetails={error.technicalDetails}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {!loaded && !error ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {loaded && projectCount === 0 ? (
        <p className="sr-only">欢迎使用。创建第一个项目后即可开始。开始创建第一个项目</p>
      ) : null}

      {loaded && loaded.length > 0 && continueRow ? (
        <section className="mb-4">
          <ResumeWorkCard task={continueRow.task} stageLabel={continueRow.stageLabel} />
        </section>
      ) : null}

      {loaded && loaded.length > 0 ? (
        <section className="mb-4">
          <h2 className="acf-section-title mb-2">需要处理</h2>
          <TaskCenter tasks={attention} />
        </section>
      ) : null}

      {loaded && loaded.length > 0 ? (
        <section className="mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="acf-section-title">最近项目</h2>
            <Link className="text-sm text-[var(--acf-text-secondary)] underline" href="/dashboard/projects">
              查看全部项目
            </Link>
          </div>
          <ul className="grid max-w-full grid-cols-1 gap-2 xl:grid-cols-2">
            {loaded.map((item) => (
              <li key={item.project.id}>
                <Card className="p-3">
                  <p className="font-semibold">{item.project.name}</p>
                  <p className="mt-1 text-sm">当前：{item.stageLabel}</p>
                  <p className="mt-0.5 text-sm font-medium">下一步：{item.task.title}</p>
                  <p className="acf-caption mt-2">
                    {[projectPlatformLabel(item.project.platform), item.project.industry].filter(Boolean).join(" · ")}
                  </p>
                  {item.project.updatedAt ? (
                    <p className="acf-caption">{formatDisplayDateTime(item.project.updatedAt)}</p>
                  ) : null}
                  <Link
                    className="mt-2 inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 text-sm"
                    href={`/dashboard/projects/${item.project.id}`}
                  >
                    进入项目
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
