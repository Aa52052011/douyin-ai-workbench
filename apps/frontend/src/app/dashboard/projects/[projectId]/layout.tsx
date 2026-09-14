"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectShell } from "../../../../components/project-shell";
import { api, isNotFoundError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { ProjectWorkspaceProvider } from "../../../../lib/project-workspace-context";
import type { Project } from "../../../../lib/types";

export default function ProjectWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { accessToken } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void api<Project>(`/projects/${projectId}`, { accessToken })
      .then((data) => {
        if (!cancelled) {
          setProject(data);
          setError(null);
          try {
            window.localStorage.setItem("acf.lastProjectId", data.id);
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setProject(null);
          setError(isNotFoundError(err) ? "项目不存在或你没有访问权限" : err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  if (error) {
    return (
      <main className="px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">无法打开项目</h1>
        <p className="mt-2 text-sm text-neutral-600">{error}</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="px-4 py-16 text-center text-sm text-neutral-600">正在打开项目…</main>
    );
  }

  return (
    <ProjectWorkspaceProvider key={projectId} project={project} setProject={setProject}>
      <ProjectShell>{children}</ProjectShell>
    </ProjectWorkspaceProvider>
  );
}
