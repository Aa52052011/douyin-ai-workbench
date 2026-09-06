"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../components/empty-state";
import { PageHeader } from "../../../../../components/page-header";
import { PublicationCompleteFormFields } from "../../../../../components/publication-complete-form";
import { PublicationDetail } from "../../../../../components/publication-detail";
import { PublicationHistory } from "../../../../../components/publication-history";
import { PublicationSourceForm } from "../../../../../components/publication-source-form";
import { useAuth } from "../../../../../lib/auth-context";
import {
  canManualComplete,
  canOpenMetrics,
  canSubmitComplete,
  defaultPublicationTitle,
  eligiblePublishVideos,
  emptyCompleteForm,
  humanizePublicationError,
  latestPublicationForVideo,
  performanceHref,
  publicationsForVideo,
  resolvePublishVideoQuery,
  videosHref,
} from "../../../../../lib/publication.form";
import { completeManualPublication, createPublication, listPublications } from "../../../../../lib/publication.api";
import type { PublicationCompleteForm, PublicationRecord } from "../../../../../lib/publication.types";
import { parsedPublicationView, publicationHistoryViews } from "../../../../../lib/publication.view";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import { exportVideoFile, listVideos } from "../../../../../lib/video.api";
import { canExportVideo } from "../../../../../lib/video.form";
import type { VideoRecord } from "../../../../../lib/video.types";
import { PUBLICATION_TITLE_MAX } from "../../../../../lib/publication.types";

function PublishPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryVideoId = searchParams.get("videoId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
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

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([listVideos(accessToken, projectId), listPublications(accessToken, projectId)]).then(
      ([videoResult, publicationResult]) => {
        if (cancelled) {
          return;
        }
        if (videoResult.status === "rejected") {
          setLoadError("无法加载发布所需信息，请刷新重试。");
          setLoading(false);
          return;
        }
        const usable = eligiblePublishVideos(videoResult.value);
        const resolved = resolvePublishVideoQuery(queryVideoId, usable);
        const selected = usable.find((item) => item.id === resolved.videoId) ?? null;
        setVideos(videoResult.value);
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
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryVideoId]);

  const usableVideos = eligiblePublishVideos(videos);
  const selectedVideo = usableVideos.find((item) => item.id === videoId) ?? null;
  const videoPublications = videoId ? publicationsForVideo(publications, videoId) : publications;
  const current =
    (selectedPublicationId ? publications.find((item) => item.id === selectedPublicationId) : null) ??
    (videoId ? latestPublicationForVideo(publications, videoId) : null);
  const currentView = current ? parsedPublicationView(current, selectedVideo) : null;
  const showCreate = Boolean(videoId && (!current || creatingNew));

  function changeVideo(nextId: string) {
    const next = usableVideos.find((item) => item.id === nextId) ?? null;
    setVideoId(nextId);
    setTitle(defaultPublicationTitle(next));
    setSelectedPublicationId("");
    setCreatingNew(false);
    setCompleteForm(emptyCompleteForm());
    setActionError(null);
    setExportMessage(null);
  }

  function replacePublication(next: PublicationRecord) {
    setPublications((rows) => {
      const exists = rows.some((item) => item.id === next.id);
      return exists ? rows.map((item) => (item.id === next.id ? next : item)) : [next, ...rows];
    });
    setSelectedPublicationId(next.id);
    setCreatingNew(false);
  }

  async function create() {
    if (!accessToken || pending || !videoId || !title.trim()) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const created = await createPublication(accessToken, videoId, title);
      replacePublication(created);
    } catch (error) {
      setActionError(humanizePublicationError(error, "create"));
    } finally {
      setPending(false);
    }
  }

  async function complete() {
    if (!accessToken || !current || pending || !canManualComplete(current) || !canSubmitComplete(completeForm)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await completeManualPublication(accessToken, current.id, completeForm);
      replacePublication(updated);
      setCompleteForm(emptyCompleteForm());
    } catch (error) {
      setActionError(humanizePublicationError(error, "complete"));
    } finally {
      setPending(false);
    }
  }

  async function download() {
    if (!accessToken || !selectedVideo || pending || !canExportVideo(selectedVideo.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    setExportMessage(null);
    try {
      const file = await exportVideoFile(accessToken, selectedVideo.id);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage("视频已导出");
    } catch {
      setActionError("视频导出失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="发布"
        description="导出成片并记录已发布作品，后续可以继续录入作品表现和优化建议。"
        breadcrumb={`项目 / ${project.name} / 发布`}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载发布记录…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && listError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {listError}
        </p>
      ) : null}

      {!loading && !loadError && usableVideos.length === 0 ? (
        <EmptyState
          title="还没有可发布的视频"
          description="先完成一条视频，再记录发布结果。"
          primaryAction={{ label: "去视频", href: videosHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && usableVideos.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}

          <PublicationSourceForm videoId={videoId} videos={usableVideos} pending={pending} onChange={changeVideo} />

          {selectedVideo && canExportVideo(selectedVideo.status) ? (
            <button className="rounded-md border px-4 py-2 text-sm disabled:opacity-50" type="button" disabled={pending} onClick={() => void download()}>
              下载视频
            </button>
          ) : null}
          {exportMessage ? <p className="text-sm text-neutral-700">{exportMessage}</p> : null}

          {actionError ? (
            <p className="text-sm text-red-600" role="alert">
              {actionError}
            </p>
          ) : null}

          {current && !creatingNew ? (
            <p className="text-sm text-neutral-700">这个视频已有发布记录</p>
          ) : null}

          {showCreate ? (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
              <label className="block text-sm font-medium" htmlFor="publish-title">
                作品标题
              </label>
              <input
                id="publish-title"
                className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                maxLength={PUBLICATION_TITLE_MAX}
                disabled={pending}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button
                className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                type="button"
                disabled={pending || !title.trim()}
                onClick={() => void create()}
              >
                创建发布记录
              </button>
            </div>
          ) : null}

          {current && !creatingNew && currentView ? <PublicationDetail view={currentView} /> : null}
          {current && !currentView ? <p className="text-sm text-neutral-600">该发布记录无法读取</p> : null}

          {current && !creatingNew && canManualComplete(current) ? (
            <PublicationCompleteFormFields form={completeForm} pending={pending} onChange={setCompleteForm} onSubmit={() => void complete()} />
          ) : null}

          {current && !creatingNew && canOpenMetrics(current.status) ? (
            <div className="space-y-2">
              <p className="text-sm text-neutral-700">已发布，可以继续录入表现数据。</p>
              <Link className="inline-block rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={performanceHref(projectId, current.id)}>
                录入表现数据
              </Link>
            </div>
          ) : null}

          {current && !creatingNew && videoId ? (
            <button
              className="rounded-md border px-4 py-2 text-sm"
              type="button"
              disabled={pending}
              onClick={() => {
                setCreatingNew(true);
                setSelectedPublicationId("");
                setTitle(defaultPublicationTitle(selectedVideo));
              }}
            >
              新增一条发布记录
            </button>
          ) : null}

          <PublicationHistory
            items={publicationHistoryViews(videoPublications, videos)}
            onView={(index) => {
              const record = videoPublications[index];
              if (record) {
                setSelectedPublicationId(record.id);
                setCreatingNew(false);
                if (record.videoId) {
                  setVideoId(record.videoId);
                }
              }
            }}
          />
        </div>
      ) : null}
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
