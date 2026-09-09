"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { PageHeader } from "../../../../../../components/page-header";
import { ScriptDetail } from "../../../../../../components/script-detail";
import { ScriptEditor } from "../../../../../../components/script-editor";
import { ScriptHistory } from "../../../../../../components/script-history";
import { ScriptProductionQueue } from "../../../../../../components/script-production-queue";
import { ScriptSourceForm } from "../../../../../../components/script-source-form";
import { WorkspacePageShell } from "../../../../../../components/workspace-page-shell";
import { useAuth } from "../../../../../../lib/auth-context";
import { listContentPlans } from "../../../../../../lib/content-planning.api";
import {
  buildTopicProductionItems,
  findNextProductionAction,
  getCurrentProductionTopic,
  summarizeProductionProgress,
} from "../../../../../../lib/content-planning.production";
import { planStatusLabel } from "../../../../../../lib/content-planning.view";
import type { ContentPlanRecord, ContentTopicRecord } from "../../../../../../lib/content-planning.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
import { listPublications } from "../../../../../../lib/publication.api";
import type { PublicationRecord } from "../../../../../../lib/publication.types";
import {
  archiveScript,
  confirmScript,
  createScript,
  listScripts,
  updateScriptDraft,
} from "../../../../../../lib/script.api";
import {
  canArchiveScript,
  canConfirmScript,
  canEditScript,
  canGenerateFromForm,
  canGenerateVideo,
  contentPlansHref,
  eligiblePlans,
  emptyScriptForm,
  hasUnconfirmedDraftAlongsideConfirmed,
  hintDurationFromTopic,
  humanizeScriptError,
  latestScriptForTopic,
  resolveScriptWorkspaceSelection,
  scriptsForTopic,
  topicsForPlan,
  videoHref,
} from "../../../../../../lib/script.form";
import type { ScriptFormState, ScriptPayloadRecord, ScriptRecord } from "../../../../../../lib/script.types";
import {
  parseScriptPayload,
  parsedScriptView,
  parseTopicSnapshot,
  scriptHistoryViews,
  scriptStatusLabel,
  topicSourceView,
} from "../../../../../../lib/script.view";
import { listVideos } from "../../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../../lib/video.types";

function ContentScriptsPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryPlanId = searchParams.get("contentPlanId");
  const queryTopicId = searchParams.get("topicId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [publications, setPublications] = useState<PublicationRecord[]>([]);
  const [form, setForm] = useState<ScriptFormState>(emptyScriptForm());
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [draft, setDraft] = useState<ScriptPayloadRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [viewingHistoricalPlan, setViewingHistoricalPlan] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [isCompactQueue, setIsCompactQueue] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsCompactQueue(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      listContentPlans(accessToken, projectId),
      listScripts(accessToken, projectId),
      listVideos(accessToken, projectId),
      listPublications(accessToken, projectId),
    ]).then(([planResult, scriptResult, videoResult, publicationResult]) => {
      if (cancelled) {
        return;
      }
      if (planResult.status === "rejected") {
        setLoadError("无法加载脚本所需信息，请刷新重试。");
        setLoading(false);
        return;
      }
      const nextPlans = planResult.value;
      const nextScripts = scriptResult.status === "fulfilled" ? scriptResult.value : [];
      const nextVideos = videoResult.status === "fulfilled" ? videoResult.value : [];
      const nextPublications = publicationResult.status === "fulfilled" ? publicationResult.value : [];
      const resolved = resolveScriptWorkspaceSelection({
        queryPlanId,
        queryTopicId,
        plans: nextPlans,
        scripts: nextScripts,
        videos: nextVideos,
        publications: nextPublications,
      });
      const selectedPlan = eligiblePlans(nextPlans).find((item) => item.id === resolved.contentPlanId) ?? null;
      const selectedTopic = topicsForPlan(selectedPlan).find((item) => item.id === resolved.topicId);
      setPlans(nextPlans);
      setScripts(nextScripts);
      setVideos(nextVideos);
      setPublications(nextPublications);
      setQueryWarning(resolved.warning);
      setViewingHistoricalPlan(resolved.viewingHistoricalPlan);
      setForm({
        ...emptyScriptForm(),
        contentPlanId: resolved.contentPlanId,
        topicId: resolved.topicId,
        targetDuration: hintDurationFromTopic(selectedTopic?.estimatedDuration),
      });
      setSelectedScriptId("");
      setEditing(false);
      setDraft(null);
      setJustConfirmed(false);
      if (scriptResult.status === "fulfilled") {
        setScriptError(null);
      } else {
        setScriptError("无法加载脚本。");
      }
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryPlanId, queryTopicId]);

  const usablePlans = eligiblePlans(plans);
  const selectedPlan = usablePlans.find((item) => item.id === form.contentPlanId) ?? null;
  const topics = topicsForPlan(selectedPlan);
  const selectedTopic = topics.find((item) => item.id === form.topicId) ?? null;

  const productionItems = selectedPlan
    ? buildTopicProductionItems({
        plan: selectedPlan,
        scripts,
        videos,
        publications,
      })
    : [];

  const progress = summarizeProductionProgress(productionItems);
  const currentProductionTopic = getCurrentProductionTopic(productionItems);
  const nextAction = findNextProductionAction(productionItems);
  const topicScripts =
    form.contentPlanId && form.topicId ? scriptsForTopic(scripts, form.contentPlanId, form.topicId) : [];
  const current = resolveCurrentScript(scripts, form, selectedScriptId);
  const currentView = current ? parsedScriptView(current) : null;
  const currentPayload = current ? parseScriptPayload(current.payload) : null;
  const source = topicSourceView(selectedTopic);
  const draftBesideConfirmed =
    form.contentPlanId && form.topicId
      ? hasUnconfirmedDraftAlongsideConfirmed(scripts, form.contentPlanId, form.topicId)
      : false;
  const focusItem = productionItems.find((item) => item.topicId === form.topicId) ?? null;
  const allScriptsDone = Boolean(selectedPlan && productionItems.length > 0 && !currentProductionTopic);

  function changeForm(next: ScriptFormState) {
    const plan = usablePlans.find((item) => item.id === next.contentPlanId) ?? null;
    const topic = topicsForPlan(plan).find((item) => item.id === next.topicId);
    const topicChanged = next.topicId !== form.topicId || next.contentPlanId !== form.contentPlanId;
    setForm({
      ...next,
      targetDuration: topicChanged ? hintDurationFromTopic(topic?.estimatedDuration) : next.targetDuration,
    });
    if (topicChanged) {
      setSelectedScriptId("");
      setEditing(false);
      setDraft(null);
      setArchiveAsk(false);
      setJustConfirmed(false);
    }
  }

  function selectQueueTopic(topicId: string) {
    const topic = topics.find((item) => item.id === topicId);
    changeForm({
      ...form,
      topicId,
      targetDuration: hintDurationFromTopic(topic?.estimatedDuration),
    });
  }

  async function refreshScripts(preferId?: string) {
    if (!accessToken || !projectId) {
      return;
    }
    const rows = await listScripts(accessToken, projectId);
    setScripts(rows);
    setSelectedScriptId(preferId ?? "");
    setScriptError(null);
  }

  async function generate() {
    if (!accessToken || pending || !canGenerateFromForm(form)) {
      return;
    }
    setPending(true);
    setActionError(null);
    setJustConfirmed(false);
    try {
      const created = await createScript(accessToken, form);
      await refreshScripts(created.id);
      setEditing(false);
      setDraft(null);
    } catch (error) {
      setActionError(humanizeScriptError(error, "generate"));
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    if (!accessToken || !current || !draft || pending || !canEditScript(current.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await updateScriptDraft(accessToken, current.id, draft);
      await refreshScripts(updated.id);
      setEditing(false);
      setDraft(null);
    } catch (error) {
      setActionError(humanizeScriptError(error, "save"));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!accessToken || !current || pending || !canConfirmScript(current.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await confirmScript(accessToken, current.id);
      await refreshScripts(updated.id);
      setJustConfirmed(true);
    } catch (error) {
      setActionError(humanizeScriptError(error, "confirm"));
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!accessToken || !current || pending || !canArchiveScript(current.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await archiveScript(accessToken, current.id);
      await refreshScripts(updated.id);
      setArchiveAsk(false);
    } catch (error) {
      setActionError(humanizeScriptError(error, "archive"));
    } finally {
      setPending(false);
    }
  }

  function goNextScriptTopic() {
    const next = getCurrentProductionTopic(
      buildTopicProductionItems({
        plan: selectedPlan!,
        scripts,
        videos,
        publications,
      }),
    );
    if (!next || !selectedPlan) {
      return;
    }
    setJustConfirmed(false);
    selectQueueTopic(next.topicId);
  }

  const actions = current ? (
    <aside className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <p className="text-neutral-600">重新生成只会生成这一条的新脚本版本，不会改变整套周计划。</p>
      {canEditScript(current.status) && currentPayload ? (
        editing ? (
          <button
            className="w-full rounded-md bg-neutral-950 px-4 py-2 text-white disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => void saveDraft()}
          >
            保存修改
          </button>
        ) : (
          <button
            className="w-full rounded-md border px-4 py-2 disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => {
              setDraft(currentPayload);
              setEditing(true);
            }}
          >
            编辑草稿
          </button>
        )
      ) : null}
      {canConfirmScript(current.status) ? (
        <div className="space-y-2">
          <button
            className="w-full rounded-md bg-neutral-950 px-4 py-2 text-white disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => void confirm()}
          >
            确认脚本
          </button>
          <p className="text-neutral-600">确认后可继续制作视频，或批量写下一条脚本。</p>
        </div>
      ) : null}
      {justConfirmed && canGenerateVideo(current.status) ? (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="font-medium text-neutral-900">✓ 第 {focusItem?.dayIndex ?? "N"} 条脚本已确认</p>
          <Link className="block rounded-md bg-neutral-950 px-4 py-2 text-center text-white" href={videoHref(projectId, current.id)}>
            制作这条视频
          </Link>
          {currentProductionTopic ? (
            <button className="w-full rounded-md border px-4 py-2" type="button" onClick={goNextScriptTopic}>
              继续制作下一条脚本
            </button>
          ) : (
            <p className="text-xs text-neutral-600">本期脚本已全部完成。</p>
          )}
        </div>
      ) : null}
      {!justConfirmed && canGenerateVideo(current.status) ? (
        <div className="space-y-2">
          <p className="text-neutral-700">脚本已确认，可以进入视频制作。</p>
          <Link className="block rounded-md bg-neutral-950 px-4 py-2 text-center text-white" href={videoHref(projectId, current.id)}>
            继续制作视频
          </Link>
        </div>
      ) : null}
      {canGenerateFromForm(form) ? (
        <button
          className="w-full rounded-md border px-4 py-2 disabled:opacity-50"
          type="button"
          disabled={pending}
          onClick={() => void generate()}
        >
          重新生成脚本
        </button>
      ) : null}
      {canArchiveScript(current.status) ? (
        <details>
          <summary className="cursor-pointer text-neutral-600">更多操作</summary>
          <button
            className="mt-2 w-full rounded-md border px-4 py-2 disabled:opacity-50"
            type="button"
            disabled={pending}
            onClick={() => setArchiveAsk(true)}
          >
            归档脚本
          </button>
        </details>
      ) : null}
      {archiveAsk ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
          <p>归档后，这份脚本不再用于视频制作。</p>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-neutral-950 px-3 py-1.5 text-white"
              type="button"
              disabled={pending}
              onClick={() => void archive()}
            >
              确认归档
            </button>
            <button className="rounded-md border px-3 py-1.5" type="button" onClick={() => setArchiveAsk(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  ) : null;

  return (
    <div>
      <PageHeader
        title="脚本"
        description="按本期内容规划顺序制作脚本。系统会自动带入当前待制作选题。"
        breadcrumb={`项目 / ${project.name} / 脚本`}
      />

      {loading ? (
        <p className="text-sm text-neutral-600" aria-live="polite">
          正在加载脚本…
        </p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && scriptError ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {scriptError}
        </p>
      ) : null}

      {!loading && !loadError && usablePlans.length === 0 ? (
        <WorkspacePageShell>
          <EmptyState
            title="还没有可用的内容计划"
            description="先确认一份内容计划，再从选题生成脚本。"
            primaryAction={{ label: "去内容计划", href: contentPlansHref(projectId) }}
          />
        </WorkspacePageShell>
      ) : null}

      {!loading && !loadError && usablePlans.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}
          {viewingHistoricalPlan ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              你正在查看历史计划。当前生产仍以最新已确认计划为准。
            </p>
          ) : null}

          {selectedPlan ? (
            <ScriptProductionQueue
              items={productionItems}
              currentTopicId={currentProductionTopic?.topicId}
              selectedTopicId={form.topicId}
              scriptReadyCount={progress.scriptReadyCount}
              onSelect={selectQueueTopic}
              compact={isCompactQueue}
            />
          ) : null}

          <WorkspacePageShell sidebar={actions}>
            <div className="space-y-6">
              <ScriptSourceForm
                form={form}
                plans={usablePlans}
                selectedPlan={selectedPlan}
                topics={topics}
                pending={pending}
                onChange={changeForm}
                collapsedByDefault
              />

              {allScriptsDone && !form.topicId ? (
                <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                  <h2 className="font-medium">本期脚本已全部完成</h2>
                  <p className="mt-1 text-neutral-600">
                    {nextAction.kind === "VIDEO"
                      ? "可以继续制作视频，或点队列查看任意一天的脚本。"
                      : nextAction.kind === "PUBLISH"
                        ? "视频已齐，可去发布。"
                        : "本期内容已全部发布。"}
                  </p>
                  {nextAction.kind === "VIDEO" && nextAction.scriptId ? (
                    <Link
                      className="mt-3 inline-block rounded-md bg-neutral-950 px-4 py-2 text-white"
                      href={videoHref(projectId, nextAction.scriptId)}
                    >
                      继续制作视频
                    </Link>
                  ) : null}
                </section>
              ) : null}

              {selectedPlan && selectedTopic && focusItem ? (
                <section className="rounded-xl border border-neutral-900 bg-white p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">当前制作</p>
                  <h2 className="mt-1 text-base font-medium text-neutral-950">
                    {focusItem.sequenceLabel} · {focusItem.title}
                  </h2>
                  <p className="mt-1 text-neutral-600">{focusItem.statusLabel}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    内容计划：第 {selectedPlan.version} 版 · {planStatusLabel(selectedPlan.status)} · 本周第{" "}
                    {focusItem.topicIndex + 1}/{productionItems.length} 条
                  </p>
                  <TopicSummary topic={selectedTopic} focus={focusItem} />
                  {draftBesideConfirmed ? (
                    <p className="mt-3 text-xs text-amber-900">有一份未确认的新版本；正式生产仍以已确认脚本为准。</p>
                  ) : null}
                </section>
              ) : null}

              {pending ? (
                <p className="text-sm text-neutral-700" aria-live="polite">
                  AI 正在生成脚本…
                </p>
              ) : null}
              {actionError ? (
                <p className="text-sm text-red-600" role="alert">
                  {actionError}
                </p>
              ) : null}

              {canGenerateFromForm(form) && !current ? (
                <button
                  className="sticky bottom-3 z-10 rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50 md:static"
                  type="button"
                  disabled={pending}
                  onClick={() => void generate()}
                >
                  生成这条脚本
                </button>
              ) : null}

              {form.topicId && !current && !pending ? (
                <p className="text-sm text-neutral-600">还没有这个选题的脚本，点击生成开始。</p>
              ) : null}

              {current && !currentView ? <p className="text-sm text-neutral-600">该版本无法读取</p> : null}

              {current && currentView && editing && draft ? (
                <ScriptEditor draft={draft} pending={pending} onChange={setDraft} />
              ) : null}

              {current && currentView && !editing ? (
                <ScriptDetail
                  view={currentView}
                  version={current.version}
                  statusLabel={scriptStatusLabel(current.status)}
                  source={parseTopicSnapshot(current.topicSnapshot) ?? source}
                />
              ) : null}
            </div>
          </WorkspacePageShell>

          {form.topicId ? (
            <ScriptHistory
              items={scriptHistoryViews(topicScripts)}
              resolveRecord={(version) => topicScripts.find((item) => item.version === version) ?? null}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function resolveCurrentScript(scripts: ScriptRecord[], form: ScriptFormState, selectedScriptId: string): ScriptRecord | null {
  if (selectedScriptId) {
    const found = scripts.find((item) => item.id === selectedScriptId);
    if (found && (!form.topicId || (found.contentPlanId === form.contentPlanId && found.topicId === form.topicId))) {
      return found;
    }
  }
  if (form.contentPlanId && form.topicId) {
    return latestScriptForTopic(scripts, form.contentPlanId, form.topicId);
  }
  return null;
}

function TopicSummary({
  topic,
  focus,
}: {
  topic: ContentTopicRecord;
  focus: { hook?: string; contentAngle?: string; contentPillar?: string; format?: string; cta?: string; reason?: string };
}) {
  return (
    <dl className="mt-3 space-y-1">
      {(focus.hook || topic.hook) && (
        <div>
          <dt className="text-neutral-500">Hook</dt>
          <dd className="whitespace-pre-wrap break-words">{focus.hook || topic.hook}</dd>
        </div>
      )}
      {(focus.contentAngle || topic.contentAngle) && (
        <div>
          <dt className="text-neutral-500">内容角度</dt>
          <dd className="break-words">{focus.contentAngle || topic.contentAngle}</dd>
        </div>
      )}
      {(focus.contentPillar || focus.format || topic.contentPillar || topic.format) && (
        <div>
          <dt className="text-neutral-500">支柱 / 形式</dt>
          <dd className="break-words">
            {[focus.contentPillar || topic.contentPillar, focus.format || topic.format].filter(Boolean).join(" · ")}
          </dd>
        </div>
      )}
      {(focus.cta || topic.cta) && (
        <div>
          <dt className="text-neutral-500">CTA</dt>
          <dd className="break-words">{focus.cta || topic.cta}</dd>
        </div>
      )}
      {focus.reason ? (
        <div>
          <dt className="text-neutral-500">本周位置</dt>
          <dd className="break-words">{focus.reason}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export default function ContentScriptsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-600">正在加载脚本…</p>}>
      <ContentScriptsPageInner />
    </Suspense>
  );
}
