"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateProjectForm } from "../../components/create-project-form";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/page-header";
import { ProjectCard } from "../../components/project-card";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { loadProjectStatus } from "../../lib/load-project-status";
import type { ProjectNextAction, ProjectStageMap } from "../../lib/project-next-action";
import type { Project } from "../../lib/types";
import { withIntakeDraftNextAction } from "../../lib/with-intake-draft-next-action";

const RECENT_LIMIT = 5;

type RecentCard = {
  project: Project;
  stages?: ProjectStageMap;
  nextAction?: ProjectNextAction;
};

export default function DashboardPage() {
  const { session, accessToken } = useAuth();
  const router = useRouter();
  const [cards, setCards] = useState<RecentCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    void api<Project[]>("/projects", { accessToken })
      .then(async (projects) => {
        const recent = [...projects]
          .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
          .slice(0, RECENT_LIMIT);
        const loaded = await Promise.all(
          recent.map(async (project) => {
            try {
              const snapshot = withIntakeDraftNextAction(
                project.id,
                await loadProjectStatus(accessToken, project.id),
              );
              return { project: snapshot.project, stages: snapshot.stages, nextAction: snapshot.nextAction };
            } catch {
              return { project };
            }
          }),
        );
        if (!cancelled) {
          setCards(loaded);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader
        title="工作台"
        description={`你好，${session?.user.name ?? "创作者"}。从最近的项目继续，或新建一个内容项目。`}
      />
      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">创建项目</h2>
        {accessToken ? (
          <CreateProjectForm
            accessToken={accessToken}
            onCreated={(project) => router.push(`/dashboard/projects/${project.id}`)}
          />
        ) : null}
      </section>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {!cards ? <p className="text-sm text-neutral-600">正在加载项目…</p> : null}
      {cards && cards.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="创建一个项目，开始从产品信息走到发布。"
        />
      ) : null}
      {cards && cards.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">最近项目</h2>
          {cards.map((card) => (
            <ProjectCard key={card.project.id} project={card.project} stages={card.stages} nextAction={card.nextAction} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
