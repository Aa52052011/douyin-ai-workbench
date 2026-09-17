"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { readLastProjectId } from "../lib/last-project";
import type { Project } from "../lib/types";

export function ProjectSwitcher() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const lastId = typeof window === "undefined" ? null : readLastProjectId();
  const current = useMemo(
    () => projects.find((item) => item.id === lastId) ?? projects[0] ?? null,
    [projects, lastId],
  );

  useEffect(() => {
    if (!accessToken) return;
    void api<Project[]>("/projects", { accessToken })
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [accessToken]);

  if (projects.length === 0) return null;
  return (
    <div className="hidden min-w-0 items-center gap-2 text-sm md:flex" data-acf-project-switcher-v2>
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="sr-only">当前项目</span>
        <select
          className="max-w-40 cursor-pointer truncate border-0 bg-transparent py-1 text-sm font-medium text-[var(--acf-text)]"
          value={current?.id ?? ""}
          onChange={(event) => {
            window.location.href = `/dashboard/projects/${event.target.value}`;
          }}
          aria-label="切换项目"
          title={current?.name}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <Link className="acf-caption shrink-0 underline" href="/dashboard/projects">
        全部项目
      </Link>
    </div>
  );
}
