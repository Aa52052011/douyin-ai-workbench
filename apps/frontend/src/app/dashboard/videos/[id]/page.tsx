"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductionPlanPanel } from "../../../../components/production-plan-panel";
import { useAuth } from "../../../../lib/auth-context";
import { api } from "../../../../lib/api";
import type { Video } from "../../../../lib/types";

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) {
      return;
    }
    void api<Video>(`/videos/${id}`, { accessToken })
      .then(setVideo)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, id]);

  const active = video ? isActiveVideo(video) : false;

  useEffect(() => {
    if (!accessToken || !id || !active) {
      return;
    }
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      void api<Video>(`/videos/${id}`, { accessToken })
        .then(setVideo)
        .catch((err: Error) => setError(err.message));
      if (ticks >= 30) {
        window.clearInterval(timer);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [accessToken, id, active]);

  async function retry() {
    if (!accessToken || !id) {
      return;
    }
    setBusy(true);
    try {
      const data = await api<Video>(`/videos/${id}/retry`, { method: "POST", accessToken });
      setVideo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setBusy(false);
    }
  }

  if (!video) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : <p>加载中…</p>}
      </main>
    );
  }

  const err = video.job?.error as { code?: string; message?: string } | null;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <Link className="text-sm underline" href="/dashboard/videos">
        返回成片
      </Link>
      <h1 className="text-2xl font-semibold">{video.scriptTitle ?? video.id}</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <section className="rounded border px-4 py-3 text-sm">
        <p>Video 状态：{video.status}</p>
        <p>Job 状态：{video.job?.status ?? "-"} · 进度 {video.job?.progress ?? 0}%</p>
        <p>耗时：{video.job?.durationMs ?? "-"} ms</p>
        <p>输出 Asset：{video.outputAssetId ?? "-"}</p>
        <p>Job：{video.sourceJobId ?? "-"}</p>
        <p>脚本：{video.scriptId ?? "-"}</p>
        <p>
          分辨率：{video.width}×{video.height} · {video.duration}s
        </p>
        <p>
          输出素材：
          {video.outputAsset ? `${video.outputAsset.type} / ${video.outputAsset.status}` : "-"}
        </p>
        {err?.code ? <p>错误：{err.code}</p> : null}
      </section>

      {accessToken ? <ProductionPlanPanel videoId={video.id} accessToken={accessToken} /> : null}

      {video.status === "FAILED" ? (
        <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void retry()}>
          Retry
        </button>
      ) : null}
    </main>
  );
}

function isActiveVideo(video: Video): boolean {
  const job = video.job?.status;
  return video.status === "PENDING" || job === "PENDING" || job === "RUNNING";
}
