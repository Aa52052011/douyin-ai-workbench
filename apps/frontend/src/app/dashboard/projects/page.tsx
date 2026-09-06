"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateProjectForm } from "../../../components/create-project-form";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import type { Project } from "../../../lib/types";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function ProjectsPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader title="项目" description="管理全部内容项目。" />
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
      {!projects ? <p className="text-sm text-neutral-600">正在加载项目…</p> : null}
      {projects && projects.length === 0 ? (
        <EmptyState title="还没有项目" description="创建第一个项目后，所有内容生产都会发生在项目里。" />
      ) : null}
      {projects && projects.length > 0 ? (
        <ul className="space-y-3">
          {projects.map((project) => {
            const meta = [project.industry, project.platform].filter(Boolean).join(" · ");
            return (
              <li key={project.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    {meta ? <p className="mt-1 text-sm text-neutral-600">{meta}</p> : null}
                    {project.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{project.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      创建 {formatTime(project.createdAt)} · 更新 {formatTime(project.updatedAt)}
                    </p>
                  </div>
                  <Link
                    className="rounded-md bg-neutral-950 px-3 py-1.5 text-sm text-white"
                    href={`/dashboard/projects/${project.id}`}
                  >
                    进入项目
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
