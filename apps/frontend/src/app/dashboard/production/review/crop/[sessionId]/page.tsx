"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiError } from "../../../../../../lib/api";
import { useAuth } from "../../../../../../lib/auth-context";
import { getAccessToken } from "../../../../../../lib/auth-session";
import {
  BACKGROUNDS,
  CHANGE_REQUESTS,
  HUMAN_REQUIRED_ITEMS,
  approveEnabledFromPayload,
  loadErrorCopy,
  mutationErrorCopy,
  stableApproveActionId,
  type ReviewPayload,
} from "../../../../../../lib/crop-review-page.model";
import { PageHeader } from "../../../../../../components/page-header";
import { FinalReviewChecklistV4 } from "../../../../../../components/final-review-checklist";
import { HumanReviewBar } from "../../../../../../components/ui/human-review-bar";
import { ProductErrorState } from "../../../../../../components/ui/error-state";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

function sessionPending(payload: ReviewPayload | null): boolean {
  const sourceAware = payload?.sourceAwarePreview?.status;
  const editorial = payload?.editorialPreview?.status;
  return (
    sourceAware === "SOURCE_AWARE_PREVIEW_PENDING" ||
    sourceAware === "SOURCE_AWARE_PREVIEW_RENDERING" ||
    sourceAware === "RENDERING" ||
    editorial === "EDITORIAL_PREVIEW_PENDING" ||
    editorial === "EDITORIAL_PREVIEW_RENDERING" ||
    editorial === "RENDERING"
  );
}

function renderFailed(payload: ReviewPayload | null): boolean {
  if (
    payload?.sourceAwarePreview?.status === "SOURCE_AWARE_PREVIEW_FAILED" ||
    payload?.editorialPreview?.status === "EDITORIAL_PREVIEW_FAILED" ||
    payload?.editorialPreview?.status === "FAILED"
  )
    return true;
  const reason = payload?.session?.invalidationReason;
  return Boolean(
    reason &&
      reason !== "PREVIEW_RENDERING" &&
      reason !== "DYNAMIC_PREVIEW_RENDERING" &&
      reason !== "EDITORIAL_PREVIEW_RENDERING" &&
      reason !== "SOURCE_AWARE_PREVIEW_RENDERING" &&
      reason !== "BACKGROUND_CHANGED" &&
      reason !== "PREVIEW_PLACEHOLDER_RECOVERY",
  );
}

export default function CropReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const { ready: authReady, session: authSession } = useAuth();
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDiag, setPreviewDiag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simMode, setSimMode] = useState<"CLEAN_9_16" | "DOUYIN_APPROX">("DOUYIN_APPROX");
  const [productionTab, setProductionTab] = useState<"vertical" | "landscape">("vertical");
  const [productionUrl, setProductionUrl] = useState<string | null>(null);
  const actionIdRef = useRef<string | null>(null);

  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!authReady || !authSession) return;
    if (!opts?.quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const data = await api<ReviewPayload>(`/production-v2/crop-review/${sessionId}${qs}`);
      setPayload(data);
      actionIdRef.current = null;
    } catch (error) {
      const err = error as ApiError;
      if (!opts?.quiet) {
        setPayload(null);
        setLoadError(loadErrorCopy(err.status, err.code));
      }
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [authReady, authSession, qs, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestedSourceAware = useRef(false);
  useEffect(() => {
    if (!authReady || !authSession || !payload || requestedSourceAware.current) return;
    const status = payload.sourceAwarePreview?.status;
    if (status === "SOURCE_AWARE_PREVIEW_PENDING" || !status) {
      requestedSourceAware.current = true;
      void runMutation(`/production-v2/crop-review/${sessionId}/source-aware-preview`, {}, "POST");
    }
  }, [authReady, authSession, payload, sessionId]);

  const rendering =
    busy ||
    sessionPending(payload) ||
    payload?.session?.invalidationReason === "PREVIEW_RENDERING" ||
    payload?.session?.invalidationReason === "EDITORIAL_PREVIEW_RENDERING" ||
    payload?.session?.invalidationReason === "SOURCE_AWARE_PREVIEW_RENDERING";

  useEffect(() => {
    if (!authReady || !authSession) return;
    if (
      !sessionPending(payload) &&
      payload?.session?.invalidationReason !== "PREVIEW_RENDERING" &&
      payload?.session?.invalidationReason !== "EDITORIAL_PREVIEW_RENDERING" &&
      payload?.session?.invalidationReason !== "SOURCE_AWARE_PREVIEW_RENDERING" &&
      payload?.sourceAwarePreview?.status !== "SOURCE_AWARE_PREVIEW_RENDERING" &&
      payload?.sourceAwarePreview?.status !== "RENDERING" &&
      payload?.editorialPreview?.status !== "EDITORIAL_PREVIEW_RENDERING" &&
      payload?.editorialPreview?.status !== "RENDERING"
    )
      return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 120_000) {
        window.clearInterval(timer);
        setActionError("预览生成超时，请稍后重试。");
        return;
      }
      void load({ quiet: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [authReady, authSession, load, payload?.session?.invalidationReason, payload?.session?.status, payload?.sourceAwarePreview?.status, payload?.editorialPreview?.status]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const mediaPath = payload?.preview?.mediaUrl;
    if (!mediaPath || !payload?.preview?.playable || !authReady || !authSession) {
      setPreviewUrl(null);
      return;
    }
    const token = getAccessToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    void fetch(`${API_BASE}${mediaPath}${qs}`, { headers, credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled || blob.size <= 0) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authReady, authSession, payload?.preview?.mediaUrl, payload?.preview?.playable, payload?.preview?.version, qs]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const mediaPath =
      productionTab === "vertical"
        ? payload?.finalProductionReview?.media?.verticalUrl
        : payload?.finalProductionReview?.media?.landscapeUrl;
    if (!mediaPath || payload?.finalProductionReview?.status !== "READY_FOR_HUMAN_REVIEW" || !authReady || !authSession) {
      setProductionUrl(null);
      return;
    }
    const token = getAccessToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    void fetch(
      `${API_BASE}${mediaPath}${projectId ? `${mediaPath.includes("?") ? "&" : "?"}projectId=${encodeURIComponent(projectId)}` : ""}`,
      { headers, credentials: "include" },
    )
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (cancelled || blob.size <= 0) return;
        objectUrl = URL.createObjectURL(blob);
        setProductionUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setProductionUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authReady, authSession, payload?.finalProductionReview?.status, payload?.finalProductionReview?.media?.verticalUrl, payload?.finalProductionReview?.media?.landscapeUrl, productionTab, projectId]);

  const approveEnabled = approveEnabledFromPayload(payload, loading) && !busy;
  const session = payload?.session;
  const warnings = payload?.warnings ?? [];
  const checklist = payload?.checklist ?? [];
  const requiredWarnings = session?.requiredWarningsJson?.length ? session.requiredWarningsJson : warnings;

  async function runMutation(path: string, body: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api<{ ok?: boolean; code?: string; value?: ReviewPayload["session"]; sourceOfTruth?: string }>(
        `${path}${qs}`,
        { method, body: JSON.stringify(body) },
      );
      if (result.ok === false) {
        const mapped = mutationErrorCopy(result.code);
        setActionError(mapped.message);
        if (mapped.stale) {
          setStaleNotice(true);
          await load();
        }
        return result;
      }
      await load();
      return result;
    } catch (error) {
      const err = error as ApiError;
      const mapped = mutationErrorCopy(err.code);
      setActionError(mapped.message);
      if (mapped.stale) {
        setStaleNotice(true);
        await load();
      }
      return { ok: false, code: err.code };
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!session || !payload) return;
    if (!actionIdRef.current) {
      actionIdRef.current = stableApproveActionId(session.id, session.previewVersion, session.reviewPacketVersion);
    }
    const acceptedWarnings = requiredWarnings.filter((item) => accepted[item]);
    await runMutation(`/production-v2/crop-review/${sessionId}/approve`, {
      schemaVersion: "crop.human-approval-command:v1",
      sessionId: session.id,
      assetId: session.assetId,
      candidateId: session.candidateId,
      candidateVersion: session.candidateVersion,
      reviewPacketVersion: session.reviewPacketVersion,
      previewRef: payload.preview?.abstractRef ?? session.previewId ?? "",
      previewVersion: session.previewVersion,
      backgroundTreatmentSelection: session.backgroundTreatment,
      acceptedWarnings,
      explicitAction: "APPROVE",
      clientActionId: actionIdRef.current,
      approvalSource: "USER_UI_ACTION",
    }, "POST");
  }

  return (
    <div className="mx-auto max-w-6xl p-4" data-acf-final-review-product>
      <PageHeader
        title="成片审核"
        description="检查竖版画面是否稳定、文字是否清楚。通过后可以下载成片并手动发布。"
        breadcrumb={[
          { label: "项目", href: projectId ? `/dashboard/projects/${projectId}` : "/dashboard/projects" },
          { label: "视频", href: projectId ? `/dashboard/projects/${projectId}/content/videos` : "/dashboard" },
          { label: "成片审核" },
        ]}
      />
      <p className="mb-4 text-sm text-neutral-600">
        这个视频需要你确认竖版画面。通过后不会自动发布。返回视频制作不会清空已保存结果。
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <section>
          {productionUrl || previewUrl ? (
            <video
              className="mx-auto max-h-[70vh] w-full bg-black object-contain"
              style={{ aspectRatio: "9 / 16", maxWidth: 360 }}
              controls
              playsInline
              src={productionUrl || previewUrl || undefined}
            />
          ) : (
            <div className="mx-auto flex aspect-[9/16] max-h-[70vh] max-w-[360px] items-center justify-center rounded-lg bg-neutral-100 text-sm text-neutral-600">
              {rendering ? "正在准备预览…" : loadError ? "视频文件暂时不可用" : "正在加载成片…"}
            </div>
          )}
        </section>
        <div className="space-y-4">
          <FinalReviewChecklistV4 />
          <HumanReviewBar
            context="这条竖版成片"
            confirmLabel="确认竖版画面"
            onConfirm={() => {
              if (approveEnabled) void onApprove();
            }}
            onRequestChanges={() =>
              void runMutation(`/production-v2/crop-review/${sessionId}/request-changes`, { request: "OTHER" }, "POST")
            }
            onDefer={() => undefined}
            onReject={() => void runMutation(`/production-v2/crop-review/${sessionId}/reject`, { reason: "OTHER" }, "POST")}
          />
          {payload?.session?.humanDecision === "APPROVED" || payload?.finalReadiness?.visualApproval === "APPROVED" ? (
            <p className="rounded-md border px-3 py-2 text-sm">已确认最终成片。下一步：下载后手动发布。</p>
          ) : null}
          {loadError ? <ProductErrorState title="没能加载审核" humanMessage={loadError} recoveryAction="刷新后重试" /> : null}
        </div>
      </div>
      <details className="mt-8 text-sm">
        <summary className="cursor-pointer text-neutral-600">技术详情</summary>
    <main className="mx-auto mt-4 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Crop Review</h1>
        {loading ? <p className="text-sm">LOADING</p> : null}
        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {staleNotice ? <p className="text-sm text-amber-700">审核版本已变化，请重新查看。</p> : null}
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm font-medium">REVIEW PREVIEW — 审核预览，不是成片</p>
        <div className="space-y-1 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          <p>Preview Type: SOURCE_AWARE_SCREEN_RECORDING</p>
          <p>Status: {payload?.sourceAwarePreview?.status ?? "SOURCE_AWARE_PREVIEW_PENDING"}</p>
          <p>Source Type: SCREEN_RECORDING_UI_DEMO</p>
          <p>Director Policy: WIDE_FIRST</p>
          <p>Review Preview: 720×1280 · Vertical profile: 1080×1920 · Landscape profile: 1920×1080 · Universal final resolution: NO</p>
          <p>Preview is not production output. productionUsable=false</p>
          <p>
            Decisions: {payload?.sourceAwarePreview?.decisionCount ?? payload?.sourceAwareEditorial?.shotCount ?? 8} · KEEP_CURRENT:{' '}
            {payload?.sourceAwarePreview?.keepCurrentCount ?? payload?.sourceAwareEditorial?.keepCurrentCount ?? 7} · Timeline:{' '}
            {payload?.sourceAwarePreview?.timelineSegmentCount ?? 1} · Rendered:{' '}
            {payload?.sourceAwarePreview?.renderedShotCount ?? 1}
          </p>
          <p>Prior EDITORIAL_SHOT / editorial-preview:runtime-1 仅作归档证据，不作为本预览片源。</p>
        </div>
        {payload?.sourceAwarePreview ? (
          <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p>Current Decision: {payload.sourceAwarePreview.currentDecision}</p>
            <p>Reason: {payload.sourceAwarePreview.reason}</p>
            <p>Semantic Integrity: {payload.sourceAwarePreview.semanticIntegrity}</p>
            <p>Plan {payload.sourceAwarePreview.planVersion} · review debug only</p>
          </div>
        ) : payload?.sourceAwareEditorial ? (
          <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p>Source Type: SCREEN_RECORDING_UI_DEMO</p>
            <p>Policy: WIDE_FIRST · MEDIUM default: NO · Shot Quota: REMOVED</p>
            <p>
              Plan {payload.sourceAwareEditorial.planVersion} · shots {payload.sourceAwareEditorial.shotCount} · KEEP_CURRENT{' '}
              {payload.sourceAwareEditorial.keepCurrentCount}
            </p>
          </div>
        ) : null}
        {payload?.preview?.smokePlaceholder ? (
          <p className="rounded border border-orange-300 bg-orange-50 p-3 text-sm">
            当前预览背景为 smoke placeholder（{payload.preview.smokeMode}），不是最终用户选择背景。SOLID 未被选择。
          </p>
        ) : null}
        {rendering ? (
          <p className="rounded border border-blue-300 bg-blue-50 p-3 text-sm">生成审核预览中…</p>
        ) : null}
        {renderFailed(payload) && !rendering ? (
          <p className="rounded border border-red-300 bg-red-50 p-3 text-sm">
            预览生成失败：{payload?.sourceAwarePreview?.failureCode ?? payload?.editorialPreview?.failureCode ?? payload?.preview?.failureCode ?? payload?.session?.invalidationReason}
          </p>
        ) : null}
        {previewUrl ? (
          <video
            className="w-full rounded bg-black"
            controls
            playsInline
            preload="metadata"
            src={previewUrl}
            onLoadedMetadata={() => setPreviewDiag("loadedmetadata")}
            onCanPlay={() => setPreviewDiag("canplay")}
            onError={(event) => {
              const media = event.currentTarget;
              setPreviewDiag(`error.code=${media.error?.code ?? "unknown"}`);
            }}
          >
            预览视频
          </video>
        ) : (
          <div className="flex aspect-[9/16] max-h-[70vh] flex-col items-center justify-center gap-2 rounded bg-neutral-900 p-4 text-sm text-white">
            {rendering
              ? "生成审核预览中…"
              : renderFailed(payload)
                ? `预览生成失败：${payload?.sourceAwarePreview?.failureCode ?? payload?.editorialPreview?.failureCode ?? payload?.preview?.failureCode ?? payload?.session?.invalidationReason}`
                : payload?.preview?.failureCode === "PREVIEW_ARTIFACT_MISSING" || payload?.preview?.status === "STALE"
                  ? "预览需要重新生成"
                  : payload?.preview?.playable
                    ? "Preview loading"
                    : "Preview not playable"}
            {!rendering &&
            session &&
            (renderFailed(payload) ||
              payload?.preview?.failureCode === "PREVIEW_ARTIFACT_MISSING" ||
              payload?.preview?.status === "STALE" ||
              !payload?.preview?.playable) ? (
              <button
                type="button"
                className="rounded bg-white px-3 py-1 text-neutral-900"
                disabled={busy || loading}
                onClick={() => void runMutation(`/production-v2/crop-review/${sessionId}/source-aware-preview`, {}, "POST")}
              >
                重新生成 preview
              </button>
            ) : null}
          </div>
        )}
        <p className="text-sm">
          {payload?.preview?.width ?? 720}×{payload?.preview?.height ?? 1280} · Preview Only · productionUsable=
          {String(payload?.preview?.productionUsable ?? false)}
        </p>
        {previewDiag ? <p className="text-xs text-neutral-500">preview event: {previewDiag}</p> : null}
        <p className="text-sm font-medium">Human Review Standard: DOUYIN_DEFAULT_MOBILE_VIEW</p>
        <p className="text-xs text-neutral-600">Desktop preview不是最终 mobile readability 判断依据。</p>
        <div className="space-y-2 rounded border p-3">
          <p className="font-medium">Douyin Mobile View Simulator</p>
          <p>Precision: APPROXIMATE_DOUYIN_MOBILE_VIEW（不是抖音 100% 真实 UI 尺寸）</p>
          <p>Mode: {simMode} · Review: 720×1280 · Vertical: 1080×1920 · Landscape: 1920×1080</p>
          <p>Source-aware preview: source-aware-preview:runtime-1 · 720×1280 review only</p>
          <div className="flex gap-2">
            <button type="button" className="rounded border px-2 py-1" onClick={() => setSimMode("CLEAN_9_16")}>
              CLEAN_9_16
            </button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => setSimMode("DOUYIN_APPROX")}>
              DOUYIN_APPROX
            </button>
          </div>
          <div className="relative mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden bg-neutral-900">
            {previewUrl ? <video className="h-full w-full object-cover" muted playsInline src={previewUrl} /> : null}
            {simMode === "DOUYIN_APPROX" ? (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[8%] bg-black/35" />
                <div className="pointer-events-none absolute inset-y-[8%] right-0 w-[12%] bg-black/25" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[20%] bg-black/40" />
              </>
            ) : null}
          </div>
          <p>Safe Area: visible · Current Decision: {payload?.sourceAwarePreview?.currentDecision ?? "WIDE_CONTEXT"}</p>
          <p>WIDE_CONTEXT / KEEP_CURRENT_COMPOSITION · Default: WIDE_FIRST</p>
        </div>
        {payload?.editorialShotDirector ? (
          <div className="space-y-2 rounded border p-3 text-xs text-neutral-500">
            <p>Archived EDITORIAL_SHOT director (not this preview source)</p>
            <p>Shot Scales: WIDE_CONTEXT / MEDIUM_FOCUS / DETAIL_READABLE</p>
            <ul className="max-h-32 list-disc overflow-auto pl-5">
              {payload.editorialShotDirector.shots.map((item) => (
                <li key={item.shotId}>
                  {(item.startMs / 1000).toFixed(1)}–{(item.endMs / 1000).toFixed(1)}s {item.shotScale}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section className="space-y-4 text-sm">
        <p>Session status: {session?.status ?? (loading ? "LOADING" : "—")}</p>
        {payload?.sourceAwarePreview ? (
          <div className="rounded border p-3">
            <p>Source-aware preview status: {payload.sourceAwarePreview.status}</p>
            <p>
              Decisions {payload.sourceAwarePreview.decisionCount} · KEEP {payload.sourceAwarePreview.keepCurrentCount} · Segments{' '}
              {payload.sourceAwarePreview.timelineSegmentCount} · Rendered {payload.sourceAwarePreview.renderedShotCount}
            </p>
            <div className="mt-3">
              <h2 className="font-medium">Source-aware UAT checklist (human only)</h2>
              <ul className="mt-1 space-y-1">
                {payload.sourceAwarePreview.humanChecklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" disabled checked={false} readOnly />
                      {item.id} ({item.interaction})
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {payload?.editorialPreview ? (
          <div className="rounded border p-3">
            <p>Editorial preview status: {payload.editorialPreview.status}</p>
            <p>
              Plan: {payload.editorialPreview.planVersion} · Total: {payload.editorialPreview.shotCount} · WIDE: {payload.editorialPreview.wideCount} · MEDIUM:{" "}
              {payload.editorialPreview.mediumCount} · DETAIL: {payload.editorialPreview.detailCount}
            </p>
            <div className="mt-3">
              <h2 className="font-medium">Editorial UAT checklist (human only)</h2>
              <ul className="mt-1 space-y-1">
                {payload.editorialPreview.humanChecklist.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" disabled checked={false} readOnly />
                      {item.id} ({item.interaction})
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        <p>
          Candidate: {payload?.candidate?.id ?? session?.candidateId ?? "—"} / {payload?.candidate?.strategy ?? "—"}
        </p>
        <p>Human decision: {payload?.humanDecision ?? session?.humanDecision ?? "—"}</p>
        <div className="rounded border border-violet-200 bg-violet-50 p-3">
          <p>Output Strategy: {payload?.outputSelection?.outputStrategy ?? payload?.sourceAwarePreview?.outputStrategy ?? "HUMAN_DECISION_REQUIRED"}</p>
          <p>Vertical: {payload?.outputSelection?.vertical.resolution ?? "1080x1920"} ({payload?.outputSelection?.vertical.status ?? "NOT_SELECTED"})</p>
          <p>Landscape: {payload?.outputSelection?.landscape.resolution ?? "1920x1080"} ({payload?.outputSelection?.landscape.status ?? "NOT_SELECTED"})</p>
          <p>Selected By: {payload?.outputSelection?.selectedBy ?? "NONE"}</p>
          <p>Selection Source: {payload?.outputSelection?.selectionSource ?? "NONE"}</p>
          <p>Production Authorized: {String(payload?.outputSelection?.productionAuthorized ?? false)}</p>
          <p>Human Approved: {String(payload?.outputSelection?.humanApproved ?? payload?.sourceAwarePreview?.humanApproved ?? false)}</p>
          <p>Approval Object: {payload?.outputSelection?.approvalObject ?? payload?.sourceAwarePreview?.approvalObject ?? "NONE"}</p>
          <p>Visual Approval: {payload?.finalReadiness?.visualApproval ?? "NOT_YET"}</p>
          <p>Approved By: {payload?.finalReadiness?.approvedBy ?? "NONE"}</p>
          <p>Approval Source: {payload?.finalReadiness?.approvalSource === "EXPLICIT_USER_MESSAGE" ? "Explicit user message" : payload?.finalReadiness?.approvalSource ?? "NONE"}</p>
          <p>Truth Gate: {payload?.finalReadiness?.truthGate ?? "PASS_WITH_RESTRICTIONS"}</p>
          <p>Vertical Production Readiness: {payload?.finalReadiness?.verticalReadiness ?? "READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION"}</p>
          <p>Landscape Production Readiness: {payload?.finalReadiness?.landscapeReadiness ?? "READY_EXCEPT_VISUAL_APPROVAL_AND_AUTHORIZATION"}</p>
          <p>Production Authorization: {String(payload?.finalReadiness?.productionAuthorization ?? false)}</p>
          <p>Authorization Object: {payload?.finalReadiness?.authorizationObject ?? "NONE"}</p>
          <p>Authorized By: {payload?.finalReadiness?.authorizedBy ?? "NONE"}</p>
          <p>
            Authorization Source:{" "}
            {payload?.finalReadiness?.authorizationSource === "EXPLICIT_USER_MESSAGE"
              ? "Explicit user message"
              : payload?.finalReadiness?.authorizationSource ?? "NONE"}
          </p>
          <p>Execution Plan: {payload?.finalReadiness?.executionPlanStatus ?? "WAITING_FOR_VISUAL_APPROVAL"}</p>
          <p>Ready To Render: {String(payload?.finalReadiness?.readyToRender ?? false)}</p>
        </div>
        {payload?.finalProductionReview?.status === "READY_FOR_HUMAN_REVIEW" ? (
          <div className="space-y-2 rounded border border-emerald-700 bg-emerald-50 p-3">
            <p className="font-medium">Final Production Review</p>
            <p>Badge: FINAL PRODUCTION</p>
            <p>Status: {payload.finalProductionReview.status}</p>
            <p>Human Acceptance: {payload.finalProductionReview.humanDecision}</p>
            <p>Publication: {payload.finalProductionReview.publication}</p>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-2 py-1" onClick={() => setProductionTab("vertical")}>
                Vertical
              </button>
              <button type="button" className="rounded border px-2 py-1" onClick={() => setProductionTab("landscape")}>
                Landscape
              </button>
            </div>
            {productionTab === "vertical" && payload.finalProductionReview.vertical ? (
              <div className="text-sm">
                <p>Artifact ID: {payload.finalProductionReview.vertical.artifactId}</p>
                <p>Profile ID: {payload.finalProductionReview.vertical.profileId}</p>
                <p>Kind: PRODUCTION (not Calibration)</p>
                <p>Resolution: {payload.finalProductionReview.vertical.resolution}</p>
                <p>productionUsable: {String(payload.finalProductionReview.vertical.productionUsable)}</p>
                <p>Duration: {payload.finalProductionReview.vertical.durationMs} ms</p>
              </div>
            ) : null}
            {productionTab === "landscape" && payload.finalProductionReview.landscape ? (
              <div className="text-sm">
                <p>Artifact ID: {payload.finalProductionReview.landscape.artifactId}</p>
                <p>Profile ID: {payload.finalProductionReview.landscape.profileId}</p>
                <p>Kind: PRODUCTION (not Calibration)</p>
                <p>Resolution: {payload.finalProductionReview.landscape.resolution}</p>
                <p>productionUsable: {String(payload.finalProductionReview.landscape.productionUsable)}</p>
                <p>Duration: {payload.finalProductionReview.landscape.durationMs} ms</p>
              </div>
            ) : null}
            {productionUrl ? (
              <video className="w-full rounded bg-black" controls playsInline preload="metadata" src={productionUrl}>
                FINAL PRODUCTION
              </video>
            ) : (
              <p className="text-sm">Loading FINAL PRODUCTION media…</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded border px-3 py-1" disabled>
                Accept Final Production
              </button>
              <button type="button" className="rounded border px-3 py-1" disabled>
                Request Changes
              </button>
              <button type="button" className="rounded border px-3 py-1" disabled>
                Reject
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              播放器读取 /production-v2/crop-review/{sessionId}/final-production-media 正式成片。以上按钮默认不选中。请先把
              delivery 包里的正式成片拷到手机：竖屏版竖屏看，横屏版横屏/全屏看。验收通过后再明确说「ACCEPT FINAL PRODUCTION」。本步不会自动验收、也不会发布。
            </p>
          </div>
        ) : null}
        <p>Background: {payload?.background?.value ?? session?.backgroundTreatment ?? "—"}</p>
        {payload?.approval?.id ? <p>Approval: {payload.approval.id} ({payload.approval.status})</p> : null}
        <p>Approve gate: {payload?.approveButton?.reason ?? "LOADING"}</p>
        <div>
          <h2 className="font-medium">Background</h2>
          <div className="mt-2 space-y-1">
            {BACKGROUNDS.map((item) => (
              <label key={item} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="background"
                  checked={session?.backgroundTreatment === item}
                  disabled={loading || busy}
                  onChange={() => {
                    void (async () => {
                      await runMutation(
                        `/production-v2/crop-review/${sessionId}/background`,
                        { backgroundTreatment: item },
                        "PATCH",
                      );
                      await runMutation(
                        `/production-v2/crop-review/${sessionId}/preview`,
                        {
                          intent: "REQUEST_RENDER",
                          solidColor: item === "SOLID" ? "#000000" : undefined,
                          clientRequestId: `preview:${sessionId}:${item}`,
                        },
                        "POST",
                      );
                    })();
                  }}
                />
                {item}
              </label>
            ))}
            <label className="flex items-center gap-2 text-neutral-400">
              <input type="radio" name="background" disabled />
              AI_GENERATED (unavailable)
            </label>
          </div>
        </div>
        <div>
          <h2 className="font-medium">Warnings</h2>
          <ul className="mt-2 space-y-1">
            {warnings.map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(accepted[item])}
                    onChange={(event) => setAccepted((current) => ({ ...current, [item]: event.target.checked }))}
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-medium">Checklist</h2>
          <ul className="mt-2 space-y-1">
            {checklist.map((item) => {
              const human = HUMAN_REQUIRED_ITEMS.includes(item.id as (typeof HUMAN_REQUIRED_ITEMS)[number]);
              return (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span>
                    {item.id} · {item.interaction}
                  </span>
                  {human ? (
                    <input
                      type="checkbox"
                      checked={item.interaction === "CONFIRMED_HUMAN"}
                      disabled={loading || busy}
                      onChange={(event) => {
                        void runMutation(
                          `/production-v2/crop-review/${sessionId}/checklist`,
                          { itemId: item.id, interaction: event.target.checked ? "CONFIRMED_HUMAN" : "PENDING_HUMAN" },
                          "PATCH",
                        );
                      }}
                    />
                  ) : (
                    <span className="text-neutral-500">system</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h2 className="font-medium">Eligible alternatives</h2>
          <ul className="mt-1 list-disc pl-5">
            {(payload?.eligibleAlternatives ?? []).map((item) => (
              <li key={item.candidateId}>
                {item.strategy} ({item.candidateId})
              </li>
            ))}
          </ul>
          <h2 className="mt-2 font-medium">Ineligible alternatives</h2>
          <ul className="mt-1 list-disc pl-5 text-neutral-500">
            {(payload?.ineligibleAlternatives ?? []).map((item) => (
              <li key={item.candidateId}>
                {item.strategy} — disabled — {item.reason}
              </li>
            ))}
          </ul>
        </div>
        {actionError ? <p className="text-red-600">{actionError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1"
            disabled={loading || busy}
            onClick={() => void runMutation(`/production-v2/crop-review/${sessionId}/reject`, { reason: "OTHER" }, "POST")}
          >
            Reject
          </button>
          {CHANGE_REQUESTS.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded border px-3 py-1"
              disabled={loading || busy}
              onClick={() =>
                void runMutation(`/production-v2/crop-review/${sessionId}/request-changes`, { request: item }, "POST")
              }
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40"
            disabled={!approveEnabled}
            onClick={() => void onApprove()}
          >
            Approve This Crop
          </button>
          <button type="button" className="rounded border px-3 py-1" disabled>
            Authorize Production
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Authorize Production 是独立授权，不等于 Visual Approval。将生成 1× Vertical production artifact 与 1× Landscape
          production artifact，两者 direct from original。Truth restrictions: C5 / C6。WAITING_FOR_PRODUCTION_AUTHORIZATION
          之前不会自动 production。AUTHORIZED_PREPARED 表示已授权并完成 execution preparation，仍不自动 production
          FFmpeg。V_1080x1920_crf18 / L_1920x1080_crf18 不是正式成片。
        </p>
        <p className="text-xs text-neutral-500">打开页面不是批准。Approve 由后端持久化状态控制。无自动批准、无 optimistic 批准。</p>
      </section>
    </main>
      </details>
    </div>
  );
}
