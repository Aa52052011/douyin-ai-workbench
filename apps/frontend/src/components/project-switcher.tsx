"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { readLastProjectId } from "../lib/last-project";
import type { Project } from "../lib/types";

export function ProjectSwitcher() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const lastId = typeof window === "undefined" ? null : readLastProjectId();

  useEffect(() => {
    if (!accessToken) return;
    void api<Project[]>("/projects", { accessToken })
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [accessToken]);

  if (projects.length === 0) return null;
  return (
    <label className="hidden items-center gap-2 text-sm md:flex">
      <span className="text-neutral-500">项目</span>
      <select
        className="max-w-40 rounded-md border border-neutral-200 bg-white px-2 py-1"
        defaultValue={lastId ?? projects[0]?.id}
        onChange={(event) => {
          window.location.href = `/dashboard/projects/${event.target.value}`;
        }}
        aria-label="切换项目"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <Link className="text-neutral-500 underline" href="/dashboard/projects">
        全部
      </Link>
    </label>
  );
}
