"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../components/empty-state";
import { InlineActionErrorV1 } from "../../../../../components/inline-action-error-v1";
import { ManualPublishCardV5 } from "../../../../../components/manual-publish-card-v5";
import { MetricsHistoryV5 } from "../../../../../components/metrics-history-v5";
import { MetricsSummaryV2 } from "../../../../../components/metrics-summary-v2";
import { MetricsTrendV1 } from "../../../../../components/metrics-trend-v1";
import { NextActionBarV1 } from "../../../../../components/next-action-bar-v1";
import { PerformanceMetricForm } from "../../../../../components/performance-metric-form";
import { PublicationDataHub } from "../../../../../components/publication-data-hub";
import { PublicationCompleteFormFields } from "../../../../../components/publication-complete-form";
import { PublicationDetail } from "../../../../../components/publication-detail";
import { PublicationHistory } from "../../../../../components/publication-history";
import { PublicationSourceForm } from "../../../../../components/publication-source-form";
import { PublishWorkflowStepsV1 } from "../../../../../components/publish-workflow-steps-v1";
import { WorkflowPageHeaderV1 } from "../../../../../components/workflow-page-header-v1";
import { useAuth } from "../../../../../lib/auth-context";
import { listContentPlans } from "../../../../../lib/content-planning.api";
import type { ContentPlanRecord } from "../../../../../lib/content-planning.types";
import { createManualMetrics, listPublicationMetrics } from "../../../../../lib/performance.api";
import { emptyMetricForm, formatObservedAt, humanizeMetricsError, sortSnapshotsNewestFirst } from "../../../../../lib/performance.form";
import type { MetricFormState, MetricSnapshotRecord } from "../../../../../lib/performance.types";
import { metricHistoryRows, parseMetricsList } from "../../../../../lib/performance.view";
import {
  canManualComplete,
  canOpenMetrics,
  canSubmitComplete,
  defaultPublicationTitle,
  emptyCompleteForm,
  findDuplicatePublication,
  humanizePublicationError,
  isRegistrationFormVisible,
  latestPublicationForVideo,
  performanceHref,
  publicationsForVideo,
  videosHref,
} from "../../../../../lib/publication.form";
import { completeManualPublication, createPublication, listPublications } from "../../../../../lib/publication.api";
import type { PublicationCompleteForm, PublicationRecord } from "../../../../../lib/publication.types";
import { parsedPublicationView, publicationHistoryViews, meaningfulLinkedVideoTitle } from "../../../../../lib/publication.view";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import {
  PUBLISH_WORKFLOW_STEPS,
  pendingProductionPublishVideos,
  publishWorkflowStepIndex,
  resolvePublishCurrentVideo,
} from "../../../../../lib/publish.workspace";
import { listScripts } from "../../../../../lib/script.api";
import type { ScriptRecord } from "../../../../../lib/script.types";
import {
  analysisReadinessCopy,
  nowLocalDatetimeValue,
  publicationTruthCopy,
  registrationVerificationCopy,
} from "../../../../../lib/ux/publication-monitoring-v5";
import { exportVideoFile, listVideos } from "../../../../../lib/video.api";
import { triggerBrowserDownload } from "../../../../../lib/video-download";
import { canExportVideo } from "../../../../../lib/video.form";
import type { VideoRecord } from "../../../../../lib/video.types";

function PublishPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryVideoId = searchParams.get("videoId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [videoId, setVideoId] = useState("");
  const [selectedPublicationId, setSelectedPublicationId] = useState("");
  const [title, setTitle] = useState("");
  const [completeForm, setCompleteForm] = useState<PublicationCompleteForm>(emptyCompleteForm());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [readyToRegister, setReadyToRegister] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [snapshots, setSnapshots] = useState<MetricSnapshotRecord[]>([]);
  const [composing, setComposing] = useState(false);
  const [metricForm, setMetricForm] = useState<MetricFormState>(emptyMetricForm(nowLocalDatetimeValue()));
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listVideos(accessToken, projectId),
      listPublications(accessToken, projectId),
      listContentPlans(accessToken, projectId),
      listScripts(accessToken, projectId),
    ]).then(([videoResult, publicationResult, planResult, scriptResult]) => {
      if (cancelled) {
        return;
      }
      if (videoResult.status === "rejected") {
        setLoadError("无法加载发布所需信息，请刷新重试。");
        setLoading(false);
        return;
      }
      const nextPlans = planResult.status === "fulfilled" ? planResult.value : [];
      const nextScripts = scriptResult.status === "fulfilled" ? scriptResult.value : [];
      const nextPublications = publicationResult.status === "fulfilled" ? publicationResult.value : [];
      const pendingVideos = pendingProductionPublishVideos(videoResult.value, nextPublications, nextPlans, nextScripts);
      const resolved = resolvePublishCurrentVideo(queryVideoId, pendingVideos);
      const selected = pendingVideos.find((item) => item.id === resolved.videoId) ?? null;
      setVideos(videoResult.value);
      setPlans(nextPlans);
      setScripts(nextScripts);
      setVideoId(resolved.videoId);
      setTitle(defaultPublicationTitle(selected));
      setQueryWarning(resolved.warning);
      setSelectedPublicationId("");
      setCreatingNew(false);
      if (publicationResult.status === "fulfilled") {
        setPublications(publicationResult.value);
        setListError(null);
      } else {
        setPublications([]);
        setListError("无法加载发布记录。");
      }
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryVideoId]);

  const pendingVideos = pendingProductionPublishVideos(videos, publications, plans, scripts);
  const selectedVideo = pendingVideos.find((item) => item.id === videoId) ?? null;
  const videoPublications = videoId ? publicationsForVideo(publications, videoId) : publications;
  const current =
    (selectedPublicationId ? publications.find((item) => item.id === selectedPublicationId) : null) ??
    (videoId ? latestPublicationForVideo(publications, videoId) : null);
  const currentView = current ? parsedPublicationView(current, selectedVideo) : null;
  const currentCyclePublication = Boolean(current && selectedVideo && current.videoId === selectedVideo.id);
  const showRegistration = isRegistrationFormVisible(readyToRegister, Boolean(selectedVideo)) && (!current || canManualComplete(current));
  const registered = Boolean(current && canOpenMetrics(current.status));
  const latest = sortSnapshotsNewestFirst(snapshots)[0] ?? null;
  const previous = sortSnapshotsNewestFirst(snapshots)[1] ?? null;
  const stepIndex = publishWorkflowStepIndex({
    hasCurrentVideo: Boolean(selectedVideo),
    downloaded,
    registering: showRegistration,
    registered,
    hasMetrics: snapshots.length > 0,
  });

  useEffect(() => {
    if (!accessToken || !current || !canOpenMetrics(current.status)) {
      setSnapshots((rows) => (rows.length === 0 ? rows : []));
      return;
    }
    const publicationId = current.id;
    let cancelled = false;
    void listPublicationMetrics(accessToken, publicationId)
      .then((value) => {
        if (!cancelled) setSnapshots(parseMetricsList(value) ?? []);
      })
      .catch(() => {
        if (!cancelled) setSnapshots((rows) => (rows.length === 0 ? rows : []));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, current?.id, current?.status]);

  function changeVideo(nextId: string) {
    const next = pendingVideos.find((item) => item.id === nextId) ?? null;
    setVideoId(nextId);
    setTitle(defaultPublicationTitle(next));
    setSelectedPublicationId("");
    setCreatingNew(false);
    setCompleteForm(emptyCompleteForm());
    setActionError(null);
    setExportMessage(null);
    setReadyToRegister(false);
    setJustRegistered(false);
    setDownloaded(false);
    setComposing(false);
  }

  function replacePublication(next: PublicationRecord) {
    setPublications((rows) => {
      const exists = rows.some((item) => item.id === next.id);
      return exists ? rows.map((item) => (item.id === next.id ? next : item)) : [next, ...rows];
    });
    setSelectedPublicationId(next.id);
    setCreatingNew(false);
  }

  async function declarePublished() {
    setReadyToRegister(true);
    setActionError(null);
  }

  function openMonitoringDetail(updated: PublicationRecord) {
    router.push(`/dashboard/monitoring/${updated.id}`);
  }

  async function register() {
    if (!accessToken || pending || !videoId || !title.trim() || !canSubmitComplete(completeForm)) {
      return;
    }
    const duplicate = findDuplicatePublication(publications, videoId, completeForm);
    if (duplicate?.status === "PUBLISHED") {
      replacePublication(duplicate);
      setJustRegistered(true);
      setReadyToRegister(false);
      setActionError("这条作品已经登记过。");
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      let record = duplicate && duplicate.status === "PENDING" ? duplicate : current && canManualComplete(current) ? current : null;
      if (!record) {
        record = await createPublication(accessToken, videoId, title);
        replacePublication(record);
      }
      const updated = await completeManualPublication(accessToken, record.id, completeForm);
      replacePublication(updated);
      setCompleteForm(emptyCompleteForm());
      setJustRegistered(true);
      setReadyToRegister(false);
      setComposing(true);
    } catch (error) {
      setActionError(humanizePublicationError(error, "complete"));
    } finally {
      setPending(false);
    }
  }

  async function download() {
    if (pending || !canExportVideo(selectedVideo?.status)) {
      return;
    }
    if (!accessToken || !selectedVideo) {
      setActionError("视频下载失败，请重试。");
      return;
    }
    setPending(true);
    setActionError(null);
    setExportMessage("正在准备下载…");
    try {
      const file = await exportVideoFile(accessToken, selectedVideo.id);
      triggerBrowserDownload(file.blob, file.filename);
      setExportMessage("已开始下载，请查看浏览器下载记录。");
      setDownloaded(true);
    } catch {
      setExportMessage(null);
      setActionError("视频下载失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  function submitMetrics() {
    if (!accessToken || !current) return;
    setPending(true);
    setActionError(null);
    void createManualMetrics(accessToken, current.id, metricForm)
      .then(() => listPublicationMetrics(accessToken, current.id))
      .then((value) => {
        setSnapshots(parseMetricsList(value) ?? []);
        setMetricForm(emptyMetricForm(nowLocalDatetimeValue()));
        setComposing(false);
        setPending(false);
      })
      .catch((err) => {
        setActionError(humanizeMetricsError(err));
        setPending(false);
      });
  }

  return (
    <div className="max-w-6xl">
      <WorkflowPageHeaderV1
        page="publish"
        projectId={projectId}
        title="发布与数据"
        description="下载并确认最终成片后，到抖音手动发布，再回来登记作品和录入数据。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "发布与数据" },
        ]}
      />
      <p className="acf-caption mb-3">手动发布模式 · 系统不会自动发布或自动抓取抖音数据</p>
      <PublicationDataHub
        compact
        projectId={projectId}
        pendingPublishCount={pendingVideos.length}
        pendingRegisterCount={publications.filter((item) => item.status === "PENDING").length}
        registeredCount={publications.filter((item) => canOpenMetrics(item.status)).length}
        monitoringCount={publications.filter((item) => item.status === "PUBLISHED").length}
        hasPublished={publications.some((item) => item.status === "PUBLISHED")}
      />
      <PublishWorkflowStepsV1 currentIndex={stepIndex} />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载发布记录…
        </p>
      ) : null}

      {!loading && loadError ? <InlineActionErrorV1 message={loadError} /> : null}

      {!loading && !loadError && listError ? <InlineActionErrorV1 message={listError} /> : null}

      {queryWarning ? (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {queryWarning}
        </p>
      ) : null}

      {!loading && !loadError && pendingVideos.length === 0 ? (
        <div className="mx-auto mt-6 max-w-md" data-acf-publish-empty-blocked>
          <EmptyState
            compact
            title="还没有可发布的最终成片"
            description="先在视频页确认最终成片，再回来发布。"
            primaryAction={{ label: "去视频", href: videosHref(projectId) }}
          />
        </div>
      ) : null}

      {!loading && !loadError && pendingVideos.length > 1 ? (
        <PublicationSourceForm videoId={videoId} videos={pendingVideos} pending={pending} onChange={changeVideo} />
      ) : null}

      {!loading && !loadError && selectedVideo ? (
        <div className="space-y-6">
          <section className="space-y-3 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
            <h2 className="acf-section-title">准备成片</h2>
            <p className="acf-body-secondary">下载竖版视频后，用抖音 App 或电脑端手动发布。这里不会替你发布。</p>
            {selectedVideo && canExportVideo(selectedVideo.status) ? (
              <button
                className="rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 py-2 text-sm text-white disabled:opacity-50"
                type="button"
                disabled={pending}
                onClick={() => void download()}
              >
                {pending ? "正在准备下载…" : "下载竖版视频"}
              </button>
            ) : (
              <p className="text-sm">视频文件仍在准备中，暂时不能下载。</p>
            )}
            {exportMessage ? <p className="text-sm text-neutral-700">{exportMessage}</p> : null}
          </section>

          <ManualPublishCardV5
            title={selectedVideo.scriptTitle || title || "未命名视频"}
            verticalReady={canExportVideo(selectedVideo.status)}
            downloaded={downloaded}
            confirmPending={pending}
            showGuide={downloaded}
            onConfirmPublished={() => void declarePublished()}
          />

          {showRegistration ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">下一步：登记你刚刚发布的作品</p>
              <PublicationCompleteFormFields
                form={completeForm}
                pending={pending}
                title={title}
                onTitleChange={setTitle}
                onChange={setCompleteForm}
                onSubmit={() => void register()}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {actionError ? <InlineActionErrorV1 message={actionError} /> : null}

      {current && !creatingNew && currentView ? (
        <PublicationDetail
          view={currentView}
          statusLabel={registrationVerificationCopy("USER_ASSERTED")}
          truthCopy={publicationTruthCopy()}
          registeredAtLabel={formatObservedAt(current.registeredAt) || formatObservedAt(current.createdAt) || undefined}
          userPublishedAtLabel={formatObservedAt(current.publishedAt) || undefined}
          linkedVideoTitle={meaningfulLinkedVideoTitle(current, selectedVideo ?? videos.find((item) => item.id === current.videoId) ?? null)}
        />
      ) : null}
      {current && !currentView ? <p className="text-sm text-neutral-600">该发布记录无法读取</p> : null}

      {current && !creatingNew && canOpenMetrics(current.status) ? (
        <div className="mt-6 space-y-4">
          {justRegistered ? <p className="text-sm font-medium">✓ 作品已登记</p> : null}
          <MetricsSummaryV2 latest={latest} previous={previous} />
          <MetricsTrendV1 snapshots={snapshots} />
          <p className="acf-body-secondary">{analysisReadinessCopy(snapshots.length)}</p>
          <div className="flex flex-wrap items-center gap-3">
            {composing ? (
              <PerformanceMetricForm
                form={metricForm}
                pending={pending}
                onChange={setMetricForm}
                onSubmit={submitMetrics}
                onCancel={() => setComposing(false)}
              />
            ) : (
              <button
                className="rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 py-2 text-sm text-white"
                type="button"
                onClick={() => setComposing(true)}
              >
                {justRegistered || snapshots.length === 0 ? "录入第一组数据" : "录入数据"}
              </button>
            )}
            <Link className="inline-flex min-h-9 items-center text-sm underline" href={performanceHref(projectId, current.id)}>
              查看 AI复盘
            </Link>
          </div>
          <MetricsHistoryV5
            collapsedByDefault
            rows={metricHistoryRows(snapshots, current.publishedAt)}
            expandedIndex={expandedIndex}
            onToggle={setExpandedIndex}
          />
          <button className="text-sm underline" type="button" onClick={() => openMonitoringDetail(current)}>
            查看表现
          </button>
        </div>
      ) : null}

      {!loading && !loadError ? (
        <div className="mt-8">
          <PublicationHistory
            items={publicationHistoryViews(
              (videoPublications.length ? videoPublications : publications).filter((item) => !current || item.id !== current.id),
              videos,
            )}
            onView={(index) => {
              const list = (videoPublications.length ? videoPublications : publications).filter(
                (item) => !current || item.id !== current.id,
              );
              const record = list[index];
              if (record) {
                setSelectedPublicationId(record.id);
                setCreatingNew(false);
                setReadyToRegister(false);
                setJustRegistered(false);
              }
            }}
          />
        </div>
      ) : null}

      <NextActionBarV1
        backHref={videosHref(projectId)}
        backLabel="返回视频"
        currentLabel={PUBLISH_WORKFLOW_STEPS[stepIndex]}
        nextHref={
          currentCyclePublication && current && canOpenMetrics(current.status)
            ? `/dashboard/monitoring/${current.id}`
            : undefined
        }
        nextLabel="查看表现"
      />
    </div>
  );
}

export default function PublishPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">正在加载发布记录…</p>}>
      <PublishPageInner />
    </Suspense>
  );
}
