"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProjectShell } from "../../../../components/project-shell";
import { api, isNotFoundError } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { ProjectWorkspaceProvider } from "../../../../lib/project-workspace-context";
import type { Project } from "../../../../lib/types";

function routeProjectId(projectId: string | string[] | undefined): string {
  if (Array.isArray(projectId)) {
    return projectId[0] ?? "";
  }
  return typeof projectId === "string" ? projectId : "";
}

/** Loading stand-in so the App Router can commit `{children}` before GET /projects/:id returns. */
function projectPlaceholder(id: string): Project {
  return {
    id,
    tenantId: "",
    workspaceId: "",
    name: "",
    industry: null,
    platform: null,
    description: null,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

export default function ProjectWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ projectId: string }>();
  const projectId = routeProjectId(params?.projectId);
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

  const workspaceProject = useMemo(
    () => project ?? (projectId ? projectPlaceholder(projectId) : projectPlaceholder("")),
    [project, projectId],
  );

  if (error) {
    return (
      <ProjectWorkspaceProvider
        key={projectId || "error"}
        project={workspaceProject}
        setProject={(next) => setProject(next)}
      >
        <main className="px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">无法打开项目</h1>
          <p className="mt-2 text-sm text-neutral-600">{error}</p>
          {children}
        </main>
      </ProjectWorkspaceProvider>
    );
  }

  return (
    <ProjectWorkspaceProvider
      key={projectId || "pending"}
      project={workspaceProject}
      setProject={(next) => setProject(next)}
    >
      <ProjectShell>{children}</ProjectShell>
    </ProjectWorkspaceProvider>
  );
}
