"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api, apiUpload } from "../../../lib/api";
import type { Asset, Project } from "../../../lib/types";

export default function AssetsPage() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const rows = await api<Asset[]>(`/assets?projectId=${encodeURIComponent(id)}`, { accessToken });
    setAssets(rows);
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

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!accessToken || !projectId || !file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const type = typeFromFile(file);
      const inited = await api<Asset>("/assets", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          projectId,
          type,
          originalFilename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      });
      await apiUpload<Asset>(`/assets/${inited.id}/content`, file, accessToken);
      await api<Asset>(`/assets/${inited.id}/complete`, { method: "POST", accessToken });
      await load(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function remove(id: string) {
    if (!accessToken) {
      return;
    }
    setBusy(true);
    try {
      await api(`/assets/${id}`, { method: "DELETE", accessToken });
      await load(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">素材库</h1>
      <div className="flex flex-wrap gap-3">
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
        <input type="file" disabled={busy || !projectId} onChange={(event) => void onUpload(event)} />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-3 py-2">文件</th>
            <th className="px-3 py-2">类型</th>
            <th className="px-3 py-2">大小</th>
            <th className="px-3 py-2">状态</th>
            <th className="px-3 py-2">创建时间</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {assets.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="px-3 py-2">{item.originalFilename ?? item.id.slice(0, 8)}</td>
              <td className="px-3 py-2">{item.type}</td>
              <td className="px-3 py-2">{item.size ?? "-"}</td>
              <td className="px-3 py-2">{item.status}</td>
              <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
              <td className="px-3 py-2">
                <button className="text-sm underline" disabled={busy} onClick={() => void remove(item.id)} type="button">
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {assets.length === 0 ? <p className="text-sm text-neutral-500">暂无素材</p> : null}
    </main>
  );
}

function typeFromFile(file: File): string {
  if (file.type.startsWith("image/")) {
    return "IMAGE";
  }
  if (file.type.startsWith("audio/")) {
    return "AUDIO";
  }
  if (file.type.startsWith("video/")) {
    return "VIDEO";
  }
  if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
    return "SUBTITLE";
  }
  return "DOCUMENT";
}
