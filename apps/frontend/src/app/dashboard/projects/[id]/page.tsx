"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../lib/auth-context";
import { api } from "../../../../lib/api";
import type { Project } from "../../../../lib/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [platform, setPlatform] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !id) {
      return;
    }
    void api<Project>(`/projects/${id}`, { accessToken })
      .then((data) => {
        setProject(data);
        setName(data.name);
        setIndustry(data.industry ?? "");
        setPlatform(data.platform ?? "");
        setDescription(data.description ?? "");
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken, id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !id) {
      return;
    }
    try {
      const data = await api<Project>(`/projects/${id}`, {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({ name, industry, platform, description }),
      });
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove() {
    if (!accessToken || !id) {
      return;
    }
    try {
      await api(`/projects/${id}`, { method: "DELETE", accessToken });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  if (!project && !error) {
    return <main className="p-6">加载中…</main>;
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">编辑项目</h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void save(event)}>
        <input className="rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        <input
          className="rounded border px-3 py-2"
          placeholder="行业"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="平台"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        />
        <textarea
          className="rounded border px-3 py-2"
          placeholder="描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-3">
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            保存
          </button>
          <button className="rounded border px-4 py-2" type="button" onClick={() => void remove()}>
            删除
          </button>
        </div>
      </form>
    </main>
  );
}
