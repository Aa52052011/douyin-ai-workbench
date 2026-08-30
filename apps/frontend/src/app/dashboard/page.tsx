"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import type { Project } from "../../lib/types";

export default function DashboardPage() {
  const { session, accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!accessToken) {
      return;
    }
    const data = await api<Project[]>("/projects", { accessToken });
    setProjects(data);
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setError(null);
    try {
      await api("/projects", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ name, industry, platform }),
      });
      setName("");
      setIndustry("");
      setPlatform("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <p className="mt-1 text-sm text-neutral-600">
          当前工作空间：{session?.workspace.name}（{session?.workspace.slug}）
        </p>
      </section>

      <form className="flex flex-wrap gap-2" onSubmit={(event) => void createProject(event)}>
        <input
          className="rounded border px-3 py-2"
          placeholder="项目名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="行业"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="平台"
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        />
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          创建项目
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="space-y-2">
        {projects.map((project) => (
          <li key={project.id} className="rounded border px-4 py-3">
            <Link href={`/dashboard/projects/${project.id}`} className="font-medium underline">
              {project.name}
            </Link>
            <p className="text-sm text-neutral-600">
              {[project.industry, project.platform].filter(Boolean).join(" · ") || "未填写行业/平台"}
            </p>
          </li>
        ))}
        {projects.length === 0 ? <li className="text-sm text-neutral-500">还没有项目</li> : null}
      </ul>
    </main>
  );
}
