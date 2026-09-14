"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { FinalReviewChecklistV4 } from "../../../../../../components/final-review-checklist";
import { ManualPublishGuideV4 } from "../../../../../../components/manual-publish-guide";
import { ProductionStatusBadge } from "../../../../../../components/production-status-badge";
import { PageHeader } from "../../../../../../components/page-header";
import { HumanReviewBar } from "../../../../../../components/ui/human-review-bar";
import { AITaskState } from "../../../../../../components/ui/ai-task-state";
import { ProductErrorState } from "../../../../../../components/ui/error-state";
import { useToast } from "../../../../../../components/ui/toast";
import { VideoDetail } from "../../../../../../components/video-detail";
import { VideoHistory } from "../../../../../../components/video-history";
import { VideoProductionContextHeaderV4 } from "../../../../../../components/video-production-context-header";
import { VideoSourceForm } from "../../../../../../components/video-source-form";
import { VideoVariantPanelV4 } from "../../../../../../components/video-variant-panel";
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
import { parsedVideoView, videoHistoryViews, videoStatusLabel } from "../../../../../../lib/video.view";
import { videoAiTaskState, videoLeaveCopy, isPortraitVideo } from "../../../../../../lib/ux/video-production-v4";
import { scriptStatusLabel } from "../../../../../../lib/script.view";

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
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [variant, setVariant] = useState<"vertical" | "landscape">("vertical");
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [previewFailedId, setPreviewFailedId] = useState<string | null>(null);
  const [prodTab, setProdTab] = useState<"all" | "pending" | "running" | "done" | "failed">("all");
  const pollerRef = useRef<ReturnType<typeof createVideoPoller> | null>(null);
  const toast = useToast();

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
  const scriptVideos = (scriptId ? videosForScript(videos, scriptId) : videos).filter((item) => {
    if (prodTab === "pending") return item.status === "PENDING";
    if (prodTab === "running") return item.status === "RUNNING" || item.status === "PROCESSING";
    if (prodTab === "done") return item.status === "COMPLETED";
    if (prodTab === "failed") return item.status === "FAILED";
    return true;
  });
  const current =
    (selectedVideoId ? videos.find((item) => item.id === selectedVideoId) : null) ??
    (scriptId ? latestVideoForScript(videos, scriptId) : null);
  const currentView = current ? parsedVideoView(current) : null;
  const currentId = current?.id ?? "";
  const currentActive = current ? isVideoPollActive(current) : false;
  const previewPath = current && canPreviewVideo(current) ? current.outputAsset?.contentPath ?? "" : "";
  const selectedScript = usableScripts.find((item) => item.id === scriptId) ?? null;
  const portrait = isPortraitVideo(current?.width, current?.height);
  const taskState = videoAiTaskState(current?.status);
  const leaveCopy = videoLeaveCopy(current?.status);

  useEffect(() => {
    setReviewAccepted(false);
    setDownloadStarted(false);
    setVariant("vertical");
  }, [currentId]);

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
      setDownloadStarted(true);
      setExportMessage("浏览器已开始下载。是否保存到电脑由浏览器决定。");
      toast("已开始下载");
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
          <button className="w-full rounded-md bg-neutral-950 px-4 py-2 text-white disabled:opacity-50" type="button" disabled={pending} onClick={() => void retry()} title="从失败位置继续，尽量复用已完成内容">
            重试生成
          </button>
          <p className="text-xs text-neutral-500">从失败位置继续，尽量复用已完成的画面、配音和字幕。</p>
        </div>
      ) : null}
      {canExportVideo(current.status) && reviewAccepted ? (
        <button className="w-full rounded-md bg-neutral-950 px-4 py-2 text-white disabled:opacity-50" type="button" disabled={pending} onClick={() => void download()}>
          {variant === "landscape" ? "下载横版视频" : "下载竖版视频"}
        </button>
      ) : null}
      {canPublishVideo(current.status) && reviewAccepted ? (
        <p className="text-neutral-600">下载后可手动发布到抖音。当前使用手动发布模式。</p>
      ) : null}
      {scriptId ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">更多操作</summary>
          <div className="mt-2 space-y-2">
            <button className="w-full rounded-md border px-4 py-2 disabled:opacity-50" type="button" disabled={pending} onClick={() => void generate()} title="重新生成这一版视频">
              重新生成视频
            </button>
            <p className="text-xs text-neutral-500">重新制作这一版视频，可能重新生成画面和配音。</p>
            {canExportVideo(current.status) && !reviewAccepted ? (
              <p className="text-xs text-neutral-500">确认成片后即可下载。</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </aside>
  ) : null;

  return (
    <div>
      <PageHeader
        title="视频制作"
        description="生成、预览、确认成片，然后下载并手动发布。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "视频" },
        ]}
      />
      <VideoProductionContextHeaderV4
        title={currentView?.title || selectedScript?.title || project.name}
        stageLabel={
          current?.status === "COMPLETED" && !reviewAccepted
            ? "成片审核"
            : current?.status === "COMPLETED" && reviewAccepted
              ? "导出"
              : "视频制作"
        }
        scriptStatus={selectedScript ? scriptStatusLabel(selectedScript.status) : undefined}
        videoStatus={current ? videoStatusLabel(current.status) : "等待开始"}
        nextAction={
          !current
            ? "开始制作视频"
            : current.status === "FAILED"
              ? "重试生成"
              : current.status === "COMPLETED" && !reviewAccepted
                ? "确认成片"
                : current.status === "COMPLETED" && reviewAccepted && !downloadStarted
                  ? "下载竖版视频"
                  : current.status === "COMPLETED" && downloadStarted
                    ? "手动发布并登记作品"
                    : "等待成片完成"
        }
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载视频…
        </p>
      ) : null}

      {!loading && loadError ? (
        <ProductErrorState title="没能加载视频" humanMessage={loadError} recoveryAction="刷新后重试" />
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
            description="确认脚本后即可制作视频。不会放演示成片。"
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
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="制作状态">
              {(
                [
                  ["all", "全部"],
                  ["pending", "待制作"],
                  ["running", "制作中"],
                  ["done", "已完成"],
                  ["failed", "失败"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-xs ${prodTab === id ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
                  onClick={() => setProdTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {current ? <ProductionStatusBadge status={current.status} /> : null}
            <VideoSourceForm
                scriptId={scriptId}
                scripts={usableScripts}
                pending={pending}
                collapsed={Boolean(scriptId)}
                onChange={(next) => {
                  setScriptId(next);
                  setSelectedVideoId("");
                  setActionError(null);
                  setPollError(null);
                  setExportMessage(null);
                }}
              />

              {taskState ? (
                <AITaskState
                  state={taskState}
                  stages={
                    currentView?.stages
                      .filter((item) => item.state === "current" || item.state === "failed")
                      .map((item) => item.label) ?? []
                  }
                />
              ) : null}
              {leaveCopy ? <p className="text-sm text-neutral-600">你可以离开此页面，任务会继续运行。回来后打开「视频」即可继续查看。</p> : null}

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
                  开始制作视频
                </button>
              ) : null}

              {scriptId && !current && !pending ? <p className="text-sm text-neutral-600">还没有这个脚本的成片，点击开始制作。</p> : null}

              {current && !currentView ? <p className="text-sm text-neutral-600">该视频状态无法读取</p> : null}

              {current && currentView ? (
                <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)] lg:items-start lg:gap-4">
                  <VideoDetail
                    view={currentView}
                    previewUrl={preview?.id === current.id ? preview.url : null}
                    previewUnavailable={previewFailedId === current.id}
                    videoId={current.id}
                    accessToken={accessToken}
                  />
                  <div className="space-y-4">
                    {current.status === "COMPLETED" ? (
                      <>
                        <VideoVariantPanelV4 portrait={portrait} selected={variant} onSelect={setVariant} />
                        {reviewAccepted ? (
                          <p className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">已确认最终成片</p>
                        ) : (
                          <>
                            <FinalReviewChecklistV4 />
                            <HumanReviewBar
                              context="这条成片"
                              confirmLabel="确认通过"
                              onConfirm={() => setReviewAccepted(true)}
                              onRequestChanges={() => undefined}
                              onDefer={() => undefined}
                            />
                            <p className="text-xs text-neutral-500">需要修改将留在视频制作页。当前没有局部剪辑，可重新生成新版本。</p>
                          </>
                        )}
                      </>
                    ) : null}
                    {downloadStarted && current.id ? <ManualPublishGuideV4 publishHref={publishHref(projectId, current.id)} /> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </WorkspacePageShell>

          <details>
            <summary className="cursor-pointer text-sm text-neutral-600">历史版本（不会删除旧版本）</summary>
            <div className="mt-3">
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
          </details>
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
