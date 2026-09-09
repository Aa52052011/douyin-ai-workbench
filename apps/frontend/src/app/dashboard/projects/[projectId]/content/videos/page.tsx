"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { PageHeader } from "../../../../../../components/page-header";
import { VideoDetail } from "../../../../../../components/video-detail";
import { VideoHistory } from "../../../../../../components/video-history";
import { VideoSourceForm } from "../../../../../../components/video-source-form";
import { WorkspacePageShell } from "../../../../../../components/workspace-page-shell";
import { useAuth } from "../../../../../../lib/auth-context";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
import { listScripts } from "../../../../../../lib/script.api";
import type { ScriptRecord } from "../../../../../../lib/script.types";
import { createVideo, exportVideoFile, fetchVideoPreview, getVideo, listVideos, retryVideo } from "../../../../../../lib/video.api";
import {
  canExportVideo,
  canPreviewVideo,
  canPublishVideo,
  canRetryVideo,
  eligibleScripts,
  humanizeVideoError,
  latestVideoForScript,
  publishHref,
  resolveVideoScriptQuery,
  scriptsHref,
  videosForScript,
} from "../../../../../../lib/video.form";
import { createVideoPoller, isVideoPollActive } from "../../../../../../lib/video.polling";
import type { VideoRecord } from "../../../../../../lib/video.types";
import { parsedVideoView, videoHistoryViews } from "../../../../../../lib/video.view";

function ContentVideosPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryScriptId = searchParams.get("scriptId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [previewFailedId, setPreviewFailedId] = useState<string | null>(null);
  const pollerRef = useRef<ReturnType<typeof createVideoPoller> | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([listScripts(accessToken, projectId), listVideos(accessToken, projectId)]).then(
      ([scriptResult, videoResult]) => {
        if (cancelled) {
          return;
        }
        if (scriptResult.status === "rejected") {
          setLoadError("无法加载视频所需信息，请刷新重试。");
          setLoading(false);
          return;
        }
        const usable = eligibleScripts(scriptResult.value);
        const resolved = resolveVideoScriptQuery(queryScriptId, usable);
        setScripts(scriptResult.value);
        setScriptId(resolved.scriptId);
        setQueryWarning(resolved.warning);
        setSelectedVideoId("");
        if (videoResult.status === "fulfilled") {
          setVideos(videoResult.value);
          setVideoError(null);
        } else {
          setVideos([]);
          setVideoError("无法加载视频。");
        }
        setLoadError(null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryScriptId]);

  const usableScripts = eligibleScripts(scripts);
  const scriptVideos = scriptId ? videosForScript(videos, scriptId) : videos;
  const current =
    (selectedVideoId ? videos.find((item) => item.id === selectedVideoId) : null) ??
    (scriptId ? latestVideoForScript(videos, scriptId) : null);
  const currentView = current ? parsedVideoView(current) : null;
  const currentId = current?.id ?? "";
  const currentActive = current ? isVideoPollActive(current) : false;
  const previewPath = current && canPreviewVideo(current) ? current.outputAsset?.contentPath ?? "" : "";

  useEffect(() => {
    if (!accessToken || !currentId || !currentActive) {
      return;
    }
    const poller = createVideoPoller({
      load: () => getVideo(accessToken, currentId),
      onUpdate: (next) => {
        setVideos((rows) => rows.map((item) => (item.id === next.id ? next : item)));
      },
      onTimeout: () => setPollError("暂时无法获取视频进度，请稍后刷新。"),
      onError: () => setPollError("暂时无法获取视频进度，请稍后刷新。"),
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      if (pollerRef.current === poller) {
        pollerRef.current = null;
      }
    };
  }, [accessToken, currentId, currentActive]);

  useEffect(() => {
    if (!accessToken || !currentId || !previewPath) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchVideoPreview(accessToken, previewPath)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id: currentId, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewFailedId(currentId);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, currentId, previewPath]);

  function replaceVideo(next: VideoRecord) {
    setVideos((rows) => {
      const exists = rows.some((item) => item.id === next.id);
      return exists ? rows.map((item) => (item.id === next.id ? next : item)) : [next, ...rows];
    });
    setSelectedVideoId(next.id);
  }

  async function generate() {
    if (!accessToken || pending || !scriptId) {
      return;
    }
    setPending(true);
    setCreating(true);
    setActionError(null);
    setPollError(null);
    setExportMessage(null);
    try {
      const created = await createVideo(accessToken, scriptId);
      replaceVideo(created);
    } catch (error) {
      setActionError(humanizeVideoError(error, "create"));
    } finally {
      setPending(false);
      setCreating(false);
    }
  }

  async function retry() {
    if (!accessToken || !current || pending || !canRetryVideo(current.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    setPollError(null);
    try {
      const updated = await retryVideo(accessToken, current.id);
      replaceVideo(updated);
    } catch (error) {
      setActionError(humanizeVideoError(error, "retry"));
    } finally {
      setPending(false);
    }
  }

  async function download() {
    if (!accessToken || !current || pending || !canExportVideo(current.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    setExportMessage(null);
    try {
      const file = await exportVideoFile(accessToken, current.id);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage("视频已导出");
    } catch (error) {
      setActionError(humanizeVideoError(error, "export"));
    } finally {
      setPending(false);
    }
  }

  const actions = current ? (
    <aside className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      {canRetryVideo(current.status) ? (
        <div className="space-y-2">
          <button className="w-full rounded-md bg-neutral-950 px-4 py-2 text-white disabled:opacity-50" type="button" disabled={pending} onClick={() => void retry()}>
            重试生成
          </button>
          <p className="text-xs text-neutral-500">继续未完成的生成，尽量复用已完成的画面、配音和字幕。</p>
        </div>
      ) : null}
      {canExportVideo(current.status) ? (
        <button className="w-full rounded-md border px-4 py-2 disabled:opacity-50" type="button" disabled={pending} onClick={() => void download()}>
          下载视频
        </button>
      ) : null}
      {canPublishVideo(current.status) ? (
        <div className="space-y-2">
          <p className="text-neutral-700">视频已完成，可以导出或继续发布。</p>
          <Link className="block rounded-md bg-neutral-950 px-4 py-2 text-center text-white" href={publishHref(projectId, current.id)}>
            下一步：发布
          </Link>
        </div>
      ) : null}
      {scriptId ? (
        <div className="space-y-2">
          <button className="w-full rounded-md border px-4 py-2 disabled:opacity-50" type="button" disabled={pending} onClick={() => void generate()}>
            重新生成视频
          </button>
          <p className="text-xs text-neutral-500">重新创建一版视频，可能重新生成画面和配音。</p>
        </div>
      ) : null}
    </aside>
  ) : null;

  return (
    <div>
      <PageHeader
        title="视频"
        description="从已确认脚本生成完整视频，查看制作进度，完成后预览和导出。"
        breadcrumb={`项目 / ${project.name} / 视频`}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载视频…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && videoError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {videoError}
        </p>
      ) : null}

      {!loading && !loadError && usableScripts.length === 0 ? (
        <WorkspacePageShell>
          <EmptyState
            title="还没有可生成视频的脚本"
            description="先确认一份脚本，再进入视频制作。"
            primaryAction={{ label: "去脚本", href: scriptsHref(projectId) }}
          />
        </WorkspacePageShell>
      ) : null}

      {!loading && !loadError && usableScripts.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}

          <WorkspacePageShell sidebar={actions}>
            <div className="space-y-6">
              <VideoSourceForm
                scriptId={scriptId}
                scripts={usableScripts}
                pending={pending}
                onChange={(next) => {
                  setScriptId(next);
                  setSelectedVideoId("");
                  setActionError(null);
                  setPollError(null);
                  setExportMessage(null);
                }}
              />

              {creating ? (
                <p className="text-sm text-neutral-700" aria-live="polite">
                  正在创建视频任务…
                </p>
              ) : null}
              {pollError ? (
                <p className="text-sm text-red-600" role="alert">
                  {pollError}
                </p>
              ) : null}
              {actionError ? (
                <p className="text-sm text-red-600" role="alert">
                  {actionError}
                </p>
              ) : null}
              {exportMessage ? <p className="text-sm text-neutral-700">{exportMessage}</p> : null}

              {scriptId && !current && !pending ? (
                <button
                  className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                  type="button"
                  disabled={pending}
                  onClick={() => void generate()}
                >
                  生成视频
                </button>
              ) : null}

              {scriptId && !current && !pending ? <p className="text-sm text-neutral-600">还没有这个脚本的视频，点击生成视频开始。</p> : null}

              {current && !currentView ? <p className="text-sm text-neutral-600">该视频状态无法读取</p> : null}

              {current && currentView ? (
                <VideoDetail
                  view={currentView}
                  previewUrl={preview?.id === current.id ? preview.url : null}
                  previewUnavailable={previewFailedId === current.id}
                />
              ) : null}
            </div>
          </WorkspacePageShell>

          <VideoHistory
            items={videoHistoryViews(scriptVideos)}
            onView={(index) => {
              const record = scriptVideos[index];
              if (record) {
                setSelectedVideoId(record.id);
                if (record.scriptId) {
                  setScriptId(record.scriptId);
                }
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function ContentVideosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">正在加载视频…</p>}>
      <ContentVideosPageInner />
    </Suspense>
  );
}
