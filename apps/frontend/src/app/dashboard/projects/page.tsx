"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateProjectForm } from "../../../components/create-project-form";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { Card } from "../../../components/ui/card";
import { ProductErrorState } from "../../../components/ui/error-state";
import { Skeleton } from "../../../components/ui/feedback";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { Project } from "../../../lib/types";
import { toProductError } from "../../../lib/ux/product-error";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function ProjectsPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof toProductError> | null>(null);

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

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader title="项目" description="管理全部内容项目。" />
      <Card id="create-project" className="mb-8">
        <h2 className="acf-section-title mb-3">创建项目</h2>
        {accessToken ? (
          <CreateProjectForm
            accessToken={accessToken}
            onCreated={(project) => router.push(`/dashboard/projects/${project.id}`)}
          />
        ) : null}
      </Card>
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
      {projects && projects.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="项目是后续定位、计划和成片的工作空间。创建第一个项目后，所有内容生产都会发生在项目里。"
          primaryAction={{ label: "去创建项目", href: "#create-project" }}
        />
      ) : null}
      {projects && projects.length > 0 ? (
        <ul className="space-y-3">
          {projects.map((project) => {
            const meta = [project.industry, project.platform].filter(Boolean).join(" · ");
            return (
              <li key={project.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="acf-card-title">{project.name}</h3>
                      {meta ? <p className="acf-body-secondary mt-1">{meta}</p> : null}
                      {project.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--acf-text-muted)]">{project.description}</p>
                      ) : null}
                      <p className="acf-caption mt-2">
                        创建 {formatTime(project.createdAt)} · 更新 {formatTime(project.updatedAt)}
                      </p>
                    </div>
                    <Link
                      className="inline-flex items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-3 py-1.5 text-sm text-white"
                      href={`/dashboard/projects/${project.id}`}
                    >
                      进入项目
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
