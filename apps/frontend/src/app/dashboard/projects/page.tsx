"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateProjectForm } from "../../../components/create-project-form";
import { PageHeader } from "../../../components/page-header";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { ProductErrorState } from "../../../components/ui/error-state";
import { Skeleton } from "../../../components/ui/feedback";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { Project } from "../../../lib/types";
import { toProductError } from "../../../lib/ux/product-error";
import { createProjectSuccessHref } from "../../../lib/ux/create-project-flow";
import { projectPlatformLabel } from "../../../lib/project-platform";
import { formatDisplayDateTime } from "../../../lib/ui-labels";

function formatTime(value: string) {
  return formatDisplayDateTime(value);
}

export default function ProjectsPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    void api<Project[]>("/projects", { accessToken })
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(toProductError(err, "没能加载项目"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const empty = projects !== null && projects.length === 0;
  const createOpen = showCreate || empty;

  return (
    <main className="min-w-0 px-4 py-6 md:px-6">
      <PageHeader
        title="项目"
        description="管理全部内容项目。"
        actions={
          projects && projects.length > 0 && !showCreate ? (
            <Button type="button" variant="secondary" onClick={() => setShowCreate(true)}>
              创建项目
            </Button>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4">
          <ProductErrorState
            title={error.title}
            humanMessage={error.humanMessage}
            recoveryAction={error.recoveryAction}
            technicalDetails={error.technicalDetails}
          />
        </div>
      ) : null}

      {!projects ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {projects && projects.length > 0 ? (
        <section>
          <h2 className="acf-section-title mb-3">已有项目</h2>
          <ul className="space-y-3">
            {projects.map((project) => {
              const meta = [projectPlatformLabel(project.platform), project.industry].filter(Boolean).join(" · ");
              return (
                <li key={project.id}>
                  <Card className="min-w-0 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 font-semibold">{project.name}</h3>
                      <Link
                        className="inline-flex min-h-9 shrink-0 items-center rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 text-sm"
                        href={`/dashboard/projects/${project.id}`}
                        prefetch={false}
                      >
                        进入项目
                      </Link>
                    </div>
                    {meta ? <p className="acf-body-secondary mt-1">{meta}</p> : null}
                    {project.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--acf-text-muted)]">{project.description}</p>
                    ) : null}
                    <p className="acf-caption mt-2">更新 {formatTime(project.updatedAt)}</p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {createOpen && accessToken ? (
        <Card id="create-project" className={`${projects && projects.length > 0 ? "mt-6" : ""} p-4`} variant="action">
          <h2 className="acf-section-title mb-3">{empty ? "创建第一个项目" : "创建项目"}</h2>
          {empty ? (
            <p className="acf-body-secondary mb-3">
              项目是后续定位、计划和成片的工作空间。创建后会进入账号定位。
            </p>
          ) : null}
          <CreateProjectForm
            accessToken={accessToken}
            layout="panel"
            submitVariant="primary"
            onCancel={empty ? undefined : () => setShowCreate(false)}
            onCreated={(project) => router.push(createProjectSuccessHref(project.id))}
          />
        </Card>
      ) : null}
    </main>
  );
}
