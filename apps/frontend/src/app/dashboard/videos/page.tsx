"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import type { Project, Script, Video } from "../../../lib/types";

export default function VideosPage() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const [scriptRows, videoRows] = await Promise.all([
      api<Script[]>(`/scripts?projectId=${encodeURIComponent(id)}`, { accessToken }),
      api<Video[]>(`/videos?projectId=${encodeURIComponent(id)}`, { accessToken }),
    ]);
    const confirmed = scriptRows.filter((item) => item.status === "CONFIRMED");
    setScripts(confirmed);
    setScriptId(confirmed[0]?.id ?? "");
    setVideos(videoRows);
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void api<Project[]>("/projects", { accessToken })
      .then((rows) => {
        setProjects(rows);
        const first = rows[0];
        if (first) {
          setProjectId(first.id);
          return load(first.id);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  const hasActive = videos.some(isActiveVideo);

  useEffect(() => {
    if (!accessToken || !projectId || !hasActive) {
      return;
    }
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      void load(projectId).catch((err: Error) => setError(err.message));
      if (ticks >= 30) {
        window.clearInterval(timer);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [accessToken, projectId, hasActive]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !scriptId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<Video>("/videos", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ scriptId, targetDuration: 15 }),
      });
      await load(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    if (!accessToken) {
      return;
    }
    setBusy(true);
    try {
      await api<Video>(`/videos/${id}/retry`, { method: "POST", accessToken });
      await load(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">成片</h1>
      <form className="flex flex-wrap gap-3" onSubmit={(event) => void generate(event)}>
        <select
          className="rounded border px-3 py-2"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            void load(event.target.value).catch((err: Error) => setError(err.message));
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select className="rounded border px-3 py-2" value={scriptId} onChange={(event) => setScriptId(event.target.value)}>
          <option value="">选择已确认脚本</option>
          {scripts.map((script) => (
            <option key={script.id} value={script.id}>
              {script.title}
            </option>
          ))}
        </select>
        <button className="rounded bg-black px-4 py-2 text-white" disabled={busy || !scriptId} type="submit">
          {busy ? "生成中..." : "生成成片"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-3 py-2">标题</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2">Job</th>
            <th className="px-3 py-2">进度</th>
            <th className="px-3 py-2">输出</th>
            <th className="px-3 py-2">创建时间</th>
            <th className="px-3 py-2">耗时</th>
            <th className="px-3 py-2">失败原因</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {videos.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="px-3 py-2">
                <Link className="underline" href={`/dashboard/videos/${item.id}`}>
                  {item.scriptTitle ?? item.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-3 py-2">{item.status}</td>
              <td className="px-3 py-2">{item.job?.status ?? "-"}</td>
              <td className="px-3 py-2">{item.job?.progress ?? 0}%</td>
              <td className="px-3 py-2">{item.outputAssetId ? item.outputAssetId.slice(0, 8) : "-"}</td>
              <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
              <td className="px-3 py-2">{item.job?.durationMs ?? "-"}</td>
              <td className="px-3 py-2">
                {typeof item.job?.error === "object" && item.job.error && "code" in item.job.error
                  ? String((item.job.error as { code?: string }).code ?? "-")
                  : "-"}
              </td>
              <td className="px-3 py-2">
                {item.status === "FAILED" ? (
                  <button className="text-sm underline" disabled={busy} onClick={() => void retry(item.id)} type="button">
                    Retry
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {videos.length === 0 ? <p className="text-sm text-neutral-500">暂无成片</p> : null}
    </main>
  );
}

function isActiveVideo(video: Video): boolean {
  const job = video.job?.status;
  return video.status === "PENDING" || job === "PENDING" || job === "RUNNING";
}
