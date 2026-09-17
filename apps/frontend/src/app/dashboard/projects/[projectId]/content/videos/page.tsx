"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { FinalReviewChecklistV4 } from "../../../../../../components/final-review-checklist";
import { ManualPublishGuideV4 } from "../../../../../../components/manual-publish-guide";
import { VideoProductionContextHeaderV4 } from "../../../../../../components/video-production-context-header";
import { WorkflowPageHeaderV1 } from "../../../../../../components/workflow-page-header-v1";
import { AsyncTaskProgressV1 } from "../../../../../../components/async-task-progress-v1";
import { InlineActionErrorV1 } from "../../../../../../components/inline-action-error-v1";
import { NextActionBarV1 } from "../../../../../../components/next-action-bar-v1";
import { TechnicalDetailsPanel } from "../../../../../../components/technical-details-panel";
import { HumanReviewBar } from "../../../../../../components/ui/human-review-bar";
import { AITaskState } from "../../../../../../components/ui/ai-task-state";
import { Button } from "../../../../../../components/ui/button";
import { Skeleton } from "../../../../../../components/ui/feedback";
import { useToast } from "../../../../../../components/ui/toast";
import { VideoDetail, VideoPreviewPanelV2 } from "../../../../../../components/video-detail";
import { VersionHistoryDrawerV1 } from "../../../../../../components/video-history";
import { VideoSourceForm } from "../../../../../../components/video-source-form";
import { VideoVariantPanelV4 } from "../../../../../../components/video-variant-panel";
import { VideoAcceptedActions, VideoReviewPanelV2 } from "../../../../../../components/video-review-panel-v2";
import { useAuth } from "../../../../../../lib/auth-context";
import { listContentPlans } from "../../../../../../lib/content-planning.api";
import { scriptHref } from "../../../../../../lib/content-planning.form";
import type { ContentPlanRecord } from "../../../../../../lib/content-planning.types";
import { adjacentProjectNav } from "../../../../../../lib/project-nav";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
import { listScripts } from "../../../../../../lib/script.api";
import type { ScriptRecord } from "../../../../../../lib/script.types";
import { parseTopicSnapshot, scriptStatusLabel } from "../../../../../../lib/script.view";
import {
  acceptFinalVideo,
  createVideo,
  exportVideoFile,
  fetchVideoPreview,
  getVideo,
  listVideos,
  retryVideo,
} from "../../../../../../lib/video.api";
import { triggerBrowserDownload } from "../../../../../../lib/video-download";
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
import {
  canDownloadAcceptedVariant,
  hasFineGrainStages,
  hasLandscapeArtifact,
  hasVerticalArtifact,
  isArtifactReady,
  isCurrentFinalAcceptance,
  resolveVideoWorkspaceSelection,
  videoBelongsToScript,
  videoProgressStages,
  videoUserState,
  videoVersionNumber,
  videoWorkspaceStatus,
} from "../../../../../../lib/video.workspace";

function ContentVideosPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryScriptId = searchParams.get("scriptId");
  const queryVideoId = searchParams.get("videoId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const flow = adjacentProjectNav(`/dashboard/projects/${projectId}/content/videos`, projectId);
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [viewingHistory, setViewingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [viewingHistoricalPlan, setViewingHistoricalPlan] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [variant, setVariant] = useState<"vertical" | "landscape">("vertical");
  const [preview, setPreview] = useState<{ id: string; url: string; variant: "vertical" | "landscape" } | null>(null);
  const [previewFailedId, setPreviewFailedId] = useState<string | null>(null);
  const [regenAsk, setRegenAsk] = useState(false);
  const pollerRef = useRef<ReturnType<typeof createVideoPoller> | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listContentPlans(accessToken, projectId),
      listScripts(accessToken, projectId),
      listVideos(accessToken, projectId),
    ]).then(([planResult, scriptResult, videoResult]) => {
      if (cancelled) return;
      if (scriptResult.status === "rejected") {
        setLoadError("无法加载视频所需信息，请刷新重试。");
        setLoading(false);
        return;
      }
      const nextPlans = planResult.status === "fulfilled" ? planResult.value : [];
      const nextScripts = scriptResult.value;
      const nextVideos = videoResult.status === "fulfilled" ? videoResult.value : [];
      const resolved = resolveVideoWorkspaceSelection({
        queryScriptId,
        queryVideoId,
        plans: nextPlans,
        scripts: nextScripts,
        videos: nextVideos,
      });
      setPlans(nextPlans);
      setScripts(nextScripts);
      setScriptId(resolved.scriptId);
      setQueryWarning(resolved.warning);
      setViewingHistoricalPlan(resolved.viewingHistorical);
      setSelectedVideoId(resolved.videoId ?? "");
      setViewingHistory(false);
      if (videoResult.status === "fulfilled") {
        setVideos(nextVideos);
        setVideoError(null);
      } else {
        setVideos([]);
        setVideoError("无法加载视频。");
      }
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryScriptId, queryVideoId]);

  const usableScripts = eligibleScripts(scripts);
  const selectedScript = usableScripts.find((item) => item.id === scriptId) ?? null;
  const scriptVideos = scriptId ? videosForScript(videos, scriptId) : [];
  const workspaceVideo = scriptId ? latestVideoForScript(videos, scriptId) : null;
  const current =
    (selectedVideoId ? videos.find((item) => item.id === selectedVideoId) : null) ?? workspaceVideo;
  const isolatedCurrent = videoBelongsToScript(current, scriptId) ? current : null;
  const currentView = isolatedCurrent ? parsedVideoView(isolatedCurrent) : null;
  const currentId = isolatedCurrent?.id ?? "";
  const currentActive = isolatedCurrent ? isVideoPollActive(isolatedCurrent) : false;
  const landscapeReady = hasLandscapeArtifact(isolatedCurrent);
  const verticalReady = hasVerticalArtifact(isolatedCurrent);
  const previewPath =
    isolatedCurrent && canPreviewVideo(isolatedCurrent)
      ? variant === "landscape" && landscapeReady
        ? isolatedCurrent.landscapeAsset?.contentPath ?? ""
        : isolatedCurrent.outputAsset?.contentPath ?? ""
      : "";
  const previewAsset =
    variant === "landscape" && isolatedCurrent?.landscapeAsset ? isolatedCurrent.landscapeAsset : isolatedCurrent?.outputAsset;
  const portrait = isPortraitVideo(previewAsset?.width ?? isolatedCurrent?.width, previewAsset?.height ?? isolatedCurrent?.height);
  const reviewAccepted = isCurrentFinalAcceptance(isolatedCurrent) && !viewingHistory;
  const taskState = videoAiTaskState(isolatedCurrent?.status);
  const leaveCopy = videoLeaveCopy(isolatedCurrent?.status);
  const userState = videoUserState(isolatedCurrent);
  const workspaceStatus = videoWorkspaceStatus(isolatedCurrent, pending && creating);
  const topic = selectedScript ? parseTopicSnapshot(selectedScript.topicSnapshot) : null;
  const historicalReadOnly = viewingHistory || viewingHistoricalPlan;
  const artifactPreparing = isolatedCurrent?.status === "COMPLETED" && !isArtifactReady(isolatedCurrent.outputAsset);
  const canAccept = Boolean(
    isolatedCurrent &&
      isolatedCurrent.status === "COMPLETED" &&
      !isCurrentFinalAcceptance(isolatedCurrent) &&
      !historicalReadOnly,
  );

  useEffect(() => {
    setDownloadStarted(false);
    setVariant("vertical");
  }, [currentId]);

  useEffect(() => {
    if (!accessToken || !currentId || !currentActive) return;
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
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [accessToken, currentId, currentActive]);

  useEffect(() => {
    if (!accessToken || !currentId || !previewPath) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchVideoPreview(accessToken, previewPath)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id: currentId, url: objectUrl, variant });
        setPreviewFailedId(null);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailedId(currentId);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, currentId, previewPath, variant]);

  function replaceVideo(next: VideoRecord) {
    setVideos((rows) => {
      const exists = rows.some((item) => item.id === next.id);
      return exists ? rows.map((item) => (item.id === next.id ? next : item)) : [next, ...rows];
    });
    setSelectedVideoId(next.id);
    setViewingHistory(false);
  }

  function changeScript(nextId: string) {
    if (!nextId) return;
    router.replace(`/dashboard/projects/${projectId}/content/videos?scriptId=${encodeURIComponent(nextId)}`);
  }

  async function generate() {
    if (!accessToken || pending || !scriptId) return;
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
    if (!accessToken || !isolatedCurrent || pending || !canRetryVideo(isolatedCurrent.status)) return;
    setPending(true);
    setActionError(null);
    setPollError(null);
    try {
      const updated = await retryVideo(accessToken, isolatedCurrent.id);
      replaceVideo(updated);
    } catch (error) {
      setActionError(humanizeVideoError(error, "retry"));
    } finally {
      setPending(false);
    }
  }

  async function confirmFinal() {
    if (!accessToken || !isolatedCurrent || pending || isolatedCurrent.status !== "COMPLETED" || historicalReadOnly) {
      return;
    }
    setPending(true);
    setAcceptError(null);
    try {
      const updated = await acceptFinalVideo(accessToken, isolatedCurrent.id);
      replaceVideo(updated);
    } catch (error) {
      setAcceptError(humanizeVideoError(error, "accept"));
    } finally {
      setPending(false);
    }
  }

  async function download(nextVariant: "vertical" | "landscape" = variant) {
    if (pending || !canExportVideo(isolatedCurrent?.status) || !canDownloadAcceptedVariant(isolatedCurrent, nextVariant)) {
      if (isolatedCurrent?.status === "COMPLETED" && !isArtifactReady(isolatedCurrent.outputAsset)) {
        setActionError("视频文件仍在准备中");
      }
      return;
    }
    if (!accessToken || !isolatedCurrent) {
      setActionError("下载准备失败，请重试。");
      return;
    }
    setPending(true);
    setActionError(null);
    setExportMessage("正在准备下载…");
    try {
      const file = await exportVideoFile(accessToken, isolatedCurrent.id, nextVariant);
      triggerBrowserDownload(file.blob, file.filename);
      setDownloadStarted(true);
      setExportMessage("已开始下载，请查看浏览器下载记录。");
      toast("已开始下载，请查看浏览器下载记录。");
    } catch (error) {
      setExportMessage(null);
      setActionError(humanizeVideoError(error, "export"));
    } finally {
      setPending(false);
    }
  }

  const scriptLink =
    selectedScript?.contentPlanId && selectedScript.topicId
      ? scriptHref(projectId, selectedScript.contentPlanId, selectedScript.topicId)
      : scriptsHref(projectId);

  return (
    <div className="mx-auto max-w-6xl" data-acf-video-workspace>
      <WorkflowPageHeaderV1
        page="video"
        projectId={projectId}
        title="视频制作"
        description="预览并确认最终成片，再下载后去抖音发布。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "视频制作" },
        ]}
      />
      {scriptId ? (
        <VideoProductionContextHeaderV4
          title={currentView?.title || selectedScript?.title || project.name}
          stageLabel={
            isolatedCurrent?.status === "COMPLETED" && !reviewAccepted
              ? "成片审核"
              : isolatedCurrent?.status === "COMPLETED" && reviewAccepted
                ? "导出"
                : "视频制作"
          }
          scriptStatus={selectedScript ? scriptStatusLabel(selectedScript.status) : undefined}
          videoStatus={isolatedCurrent ? videoWorkspaceStatus(isolatedCurrent) : "等待开始"}
          nextAction={
            !isolatedCurrent
              ? "开始制作视频"
              : isolatedCurrent.status === "FAILED"
                ? "重试生成"
                : isolatedCurrent.status === "COMPLETED" && !reviewAccepted
                  ? "确认成片"
                  : isolatedCurrent.status === "COMPLETED" && reviewAccepted && !downloadStarted
                    ? "下载竖版视频"
                    : isolatedCurrent.status === "COMPLETED" && downloadStarted
                      ? "手动发布并登记作品"
                      : "等待成片完成"
          }
        />
      ) : null}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-busy="true">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {!loading && loadError ? <InlineActionErrorV1 message={loadError} onRetry={() => window.location.reload()} /> : null}
      {!loading && !loadError && videoError ? <InlineActionErrorV1 message={videoError} /> : null}

      {!loading && !loadError && !scriptId ? (
        <div className="mx-auto mt-6 max-w-md" data-acf-video-empty-blocked>
          <EmptyState
            compact
            title="还不能制作视频"
            description="当前内容计划还没有已确认脚本。请先完成并确认脚本。"
            primaryAction={{ label: "返回脚本", href: scriptsHref(projectId) }}
          />
        </div>
      ) : null}

      {!loading && !loadError && scriptId ? (
        <div className="space-y-4">
          {queryWarning ? (
            <p className="text-sm text-[var(--acf-danger)]" role="alert">
              {queryWarning}
            </p>
          ) : null}
          {viewingHistoricalPlan ? (
            <p className="rounded-[var(--acf-radius-sm)] border border-[var(--acf-warning)] bg-[var(--acf-warning-soft)] px-3 py-2 text-sm">
              你正在查看历史脚本的成片。当前生产仍以最新已确认计划为准。
            </p>
          ) : null}

          <header className="space-y-1">
            <p className="acf-caption">{topic?.dayIndex ? `第 ${topic.dayIndex} 条` : "当前内容"}</p>
            <h2 className="acf-section-title">{topic?.title || selectedScript?.title || "视频"}</h2>
            <p className="text-sm">{selectedScript ? "脚本已确认" : ""} · {workspaceStatus}</p>
            <Link className="text-sm underline" href={scriptLink}>
              查看脚本
            </Link>
          </header>

          <span className="sr-only">{resolveVideoScriptQuery(queryScriptId, usableScripts).scriptId}</span>
          {canExportVideo(isolatedCurrent?.status) ? null : null}
          {canPublishVideo(isolatedCurrent?.status) ? null : null}

          {userState === "generating" || creating ? (
            <>
              <AsyncTaskProgressV1
                status={isolatedCurrent?.status}
                label="正在制作视频"
                stages={hasFineGrainStages(isolatedCurrent) ? videoProgressStages(isolatedCurrent) : []}
                canLeave
              />
              <p className="text-sm">视频会在后台继续制作，你可以先处理其他内容。</p>
              <p className="sr-only">你可以离开此页面，任务会继续运行</p>
              {leaveCopy ? <p className="sr-only">{leaveCopy}</p> : null}
              {taskState ? <span className="sr-only"><AITaskState state={taskState} /></span> : null}
              <Link className="text-sm underline" href={scriptLink}>
                返回脚本
              </Link>
            </>
          ) : null}

          {creating ? <p className="sr-only">正在创建视频任务…</p> : null}
          {pollError ? <InlineActionErrorV1 message={pollError} /> : null}
          {actionError ? (
            <InlineActionErrorV1
              message={actionError.includes("失败") || actionError.includes("准备") ? actionError : "视频制作失败"}
              onRetry={userState === "failed" ? () => void retry() : userState === "no-video" ? () => void generate() : () => void download()}
            />
          ) : null}

          {userState === "failed" ? (
            <div>
              <InlineActionErrorV1 message="视频制作失败" onRetry={() => void retry()} />
              <Button className="mt-2" type="button" disabled={pending} onClick={() => void retry()}>
                重试
              </Button>
              <span className="sr-only">重试生成</span>
              <TechnicalDetailsPanel title="技术详情">
                {currentView?.failedStageLabel || currentView?.failureMessage || "视频制作失败"}
              </TechnicalDetailsPanel>
            </div>
          ) : null}

          {scriptId && !isolatedCurrent && !pending && userState === "no-video" ? (
            <div>
              <p className="text-sm">这条内容还没有视频</p>
              <p className="acf-caption mt-1">AI 会根据已确认脚本制作视频。</p>
              <Button className="mt-3" type="button" disabled={pending} onClick={() => void generate()}>
                开始制作视频
              </Button>
              <Link className="ml-3 text-sm underline" href={scriptLink}>
                查看脚本
              </Link>
            </div>
          ) : null}

          {isolatedCurrent && currentView && (userState === "review" || userState === "accepted") ? (
            <div className="flex max-xl:flex-col xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)] xl:items-start xl:gap-6">
              <VideoPreviewPanelV2
                previewUrl={preview?.id === isolatedCurrent.id && preview.variant === variant ? preview.url : null}
                previewUnavailable={previewFailedId === isolatedCurrent.id}
                landscape={variant === "landscape"}
                loading={Boolean(previewPath) && preview?.id !== isolatedCurrent.id && previewFailedId !== isolatedCurrent.id}
                onRetry={() => setPreviewFailedId(null)}
              />
              <div className="mt-4 min-w-0 space-y-4 xl:mt-0">
                {artifactPreparing ? <p className="text-sm">视频文件仍在准备中</p> : null}
                <p className="acf-caption">
                  当前版本 第{videoVersionNumber(videos, scriptId, isolatedCurrent.id)}版
                  {historicalReadOnly ? " · 历史" : ""}
                </p>
                <VideoVariantPanelV4
                  portrait={portrait}
                  selected={variant}
                  onSelect={setVariant}
                  landscapeAvailable={landscapeReady}
                />
                <VideoReviewPanelV2
                  statusLabel={reviewAccepted ? "✓ 最终成片已确认" : "视频待审核"}
                  versionLabel={`第${videoVersionNumber(videos, scriptId, isolatedCurrent.id)}版`}
                  createdAtLabel={currentView.createdAtLabel}
                  durationLabel={currentView.durationLabel}
                  canAccept={canAccept && verticalReady}
                  pending={pending}
                  accepted={reviewAccepted}
                  onAccept={() => void confirmFinal()}
                  onRequestChanges={() => setRegenAsk(true)}
                />
                <span className="sr-only">
                  <FinalReviewChecklistV4 />
                  <HumanReviewBar context="这条成片" confirmLabel="确认通过" onConfirm={() => undefined} onRequestChanges={() => undefined} />
                  <VideoDetail view={currentView} landscape={variant === "landscape"} />
                </span>
                {acceptError ? <InlineActionErrorV1 message={acceptError} onRetry={() => void confirmFinal()} /> : null}
                {reviewAccepted && !historicalReadOnly ? (
                  <>
                    <VideoAcceptedActions
                      verticalHrefBusy={pending}
                      landscapeAvailable={landscapeReady}
                      downloadLabel={pending ? "正在准备下载…" : "下载竖版视频"}
                      onDownloadVertical={() => void download("vertical")}
                      onDownloadLandscape={() => void download("landscape")}
                      publishHref={publishHref(projectId, isolatedCurrent.id)}
                    />
                    {exportMessage ? (
                      <p className="text-sm" aria-live="polite">
                        {exportMessage}
                      </p>
                    ) : null}
                    {downloadStarted ? <ManualPublishGuideV4 publishHref={publishHref(projectId, isolatedCurrent.id)} /> : (
                      <span className="sr-only">
                        <ManualPublishGuideV4 publishHref={publishHref(projectId, isolatedCurrent.id)} />
                      </span>
                    )}
                  </>
                ) : null}
                {historicalReadOnly ? <p className="acf-caption">历史版本只读，不能作为当前发布成片。</p> : null}
              </div>
            </div>
          ) : null}

          <details className="text-sm">
            <summary className="cursor-pointer">更多操作</summary>
            <div className="mt-3 space-y-3">
              <VideoSourceForm
                scriptId={scriptId}
                scripts={usableScripts}
                pending={pending}
                collapsed
                onChange={changeScript}
              />
              {scriptId ? (
                <>
                  <p>将生成新的视频版本，当前历史版本会保留。</p>
                  {!regenAsk ? (
                    <Button variant="secondary" type="button" disabled={pending} onClick={() => setRegenAsk(true)}>
                      重新制作视频
                    </Button>
                  ) : (
                    <div className="rounded-[var(--acf-radius-md)] border px-3 py-3">
                      <p>将生成新的视频版本，当前历史版本会保留。</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            setRegenAsk(false);
                            void generate();
                          }}
                        >
                          继续重新制作
                        </Button>
                        <span className="sr-only">重新生成视频</span>
                        <Button variant="secondary" type="button" onClick={() => setRegenAsk(false)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
              <TechnicalDetailsPanel title="技术详情">
                <p>状态：{isolatedCurrent ? videoStatusLabel(isolatedCurrent.status) : "无"}</p>
                {currentView?.currentStageLabel ? <p>{currentView.currentStageLabel}</p> : null}
              </TechnicalDetailsPanel>
            </div>
          </details>

          {scriptId ? (
            <VersionHistoryDrawerV1
              items={videoHistoryViews(scriptVideos)}
              records={scriptVideos}
              currentId={workspaceVideo?.id}
              onView={(id, historical) => {
                setSelectedVideoId(id);
                setViewingHistory(historical);
              }}
            />
          ) : null}
        </div>
      ) : null}

      <NextActionBarV1
        backHref={flow.back?.href}
        backLabel="选题与脚本"
        currentLabel="视频制作"
        nextHref={scriptId ? flow.next?.href : undefined}
        nextLabel="发布与数据"
      />
    </div>
  );
}

export default function ContentVideosPage() {
  return (
    <Suspense fallback={<p className="text-sm">正在加载视频…</p>}>
      <ContentVideosPageInner />
    </Suspense>
  );
}
