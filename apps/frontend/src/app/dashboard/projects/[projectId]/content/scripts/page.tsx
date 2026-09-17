"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { WorkflowPageHeaderV1 } from "../../../../../../components/workflow-page-header-v1";
import { AsyncTaskProgressV1 } from "../../../../../../components/async-task-progress-v1";
import { InlineActionErrorV1 } from "../../../../../../components/inline-action-error-v1";
import { NextActionBarV1 } from "../../../../../../components/next-action-bar-v1";
import { TopicDetailDrawerV1 } from "../../../../../../components/content-planning-topics";
import { ScriptEditor, ScriptEditorV2 } from "../../../../../../components/script-editor";
import { ScriptHistory } from "../../../../../../components/script-history";
import { ScriptProductionQueue } from "../../../../../../components/script-production-queue";
import { ScriptConfirmedActions, ScriptReviewPanelV2 } from "../../../../../../components/script-review-panel-v2";
import { ScriptSourceForm } from "../../../../../../components/script-source-form";
import { Button } from "../../../../../../components/ui/button";
import { Dialog } from "../../../../../../components/ui/dialog";
import { HumanReviewBar } from "../../../../../../components/ui/human-review-bar";
import { Skeleton } from "../../../../../../components/ui/feedback";
import { useToast } from "../../../../../../components/ui/toast";
import { useAuth } from "../../../../../../lib/auth-context";
import { listContentPlans } from "../../../../../../lib/content-planning.api";
import { scriptHref } from "../../../../../../lib/content-planning.form";
import {
  buildTopicProductionItems,
  findNextProductionAction,
  getCurrentProductionTopic,
} from "../../../../../../lib/content-planning.production";
import type { ContentPlanRecord, ContentTopicRecord, TopicCardView } from "../../../../../../lib/content-planning.types";
import { adjacentProjectNav } from "../../../../../../lib/project-nav";
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
  resolveScriptWorkspaceSelection,
  scriptsForTopic,
  topicsForPlan,
  videoHref,
} from "../../../../../../lib/script.form";
import type { ScriptFormState, ScriptPayloadRecord, ScriptRecord } from "../../../../../../lib/script.types";
import {
  parseScriptPayload,
  parsedScriptView,
  formatScriptTime,
  scriptHistoryViews,
} from "../../../../../../lib/script.view";
import { selectWorkspaceScript, scriptBelongsToPlan, scriptWorkspaceStatusLabel } from "../../../../../../lib/script.workspace";
import { listVideos } from "../../../../../../lib/video.api";
import type { VideoRecord } from "../../../../../../lib/video.types";

function ContentScriptsPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryPlanId = searchParams.get("contentPlanId");
  const queryTopicId = searchParams.get("topicId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const toast = useToast();
  const flow = adjacentProjectNav(`/dashboard/projects/${projectId}/content/scripts`, projectId);
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
  const [regenAsk, setRegenAsk] = useState(false);
  const [userEditedDraft, setUserEditedDraft] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [isCompactQueue, setIsCompactQueue] = useState(false);
  const [topicDetailOpen, setTopicDetailOpen] = useState(false);
  const [historyOpenSignal, setHistoryOpenSignal] = useState(0);
  const [pendingSwitchTopicId, setPendingSwitchTopicId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)");
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
        setLoadError("无法加载本期内容");
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
      setUserEditedDraft(false);
      if (scriptResult.status === "fulfilled") {
        setScriptError(null);
      } else {
        setScriptError("无法加载这条脚本");
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

  const currentProductionTopic = getCurrentProductionTopic(productionItems);
  const nextAction = findNextProductionAction(productionItems);
  const topicScripts =
    form.contentPlanId && form.topicId ? scriptsForTopic(scripts, form.contentPlanId, form.topicId) : [];
  const current = selectWorkspaceScript(scripts, form.contentPlanId, form.topicId, selectedScriptId);
  const isolatedCurrent = scriptBelongsToPlan(current, form.contentPlanId) ? current : null;
  const currentView = isolatedCurrent ? parsedScriptView(isolatedCurrent) : null;
  const currentPayload = isolatedCurrent ? parseScriptPayload(isolatedCurrent.payload) : null;
  const draftBesideConfirmed =
    form.contentPlanId && form.topicId
      ? hasUnconfirmedDraftAlongsideConfirmed(scripts, form.contentPlanId, form.topicId)
      : false;
  const focusItem = productionItems.find((item) => item.topicId === form.topicId) ?? null;
  const hasVideo = Boolean(
    isolatedCurrent && videos.some((item) => item.scriptId === isolatedCurrent.id),
  );
  const workspaceStatus = scriptWorkspaceStatusLabel({
    script: isolatedCurrent,
    generating: pending && !isolatedCurrent,
    failed: Boolean(actionError) && !isolatedCurrent,
    hasVideo,
  });
  const topicCard = selectedTopic ? topicToCard(selectedTopic) : null;
  const generating = pending && !isolatedCurrent;

  function navigateTopic(topicId: string) {
    if (!form.contentPlanId) return;
    setPendingSwitchTopicId(null);
    router.replace(scriptHref(projectId, form.contentPlanId, topicId));
  }

  function requestSelectTopic(topicId: string) {
    if (topicId === form.topicId) return;
    if (userEditedDraft && editing) {
      setPendingSwitchTopicId(topicId);
      return;
    }
    navigateTopic(topicId);
  }

  function changeForm(next: ScriptFormState) {
    const plan = usablePlans.find((item) => item.id === next.contentPlanId) ?? null;
    const topic = topicsForPlan(plan).find((item) => item.id === next.topicId);
    const topicChanged = next.topicId !== form.topicId || next.contentPlanId !== form.contentPlanId;
    if (topicChanged && next.contentPlanId && next.topicId) {
      router.replace(scriptHref(projectId, next.contentPlanId, next.topicId));
      return;
    }
    setForm({
      ...next,
      targetDuration: topicChanged ? hintDurationFromTopic(topic?.estimatedDuration) : next.targetDuration,
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
    if (!accessToken || !isolatedCurrent || !draft || pending || !canEditScript(isolatedCurrent.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    setSaveNotice("正在保存…");
    try {
      const updated = await updateScriptDraft(accessToken, isolatedCurrent.id, draft);
      await refreshScripts(updated.id);
      setEditing(false);
      setDraft(null);
      setUserEditedDraft(false);
      setSaveNotice("已保存");
      toast("已保存");
    } catch (error) {
      setSaveNotice(null);
      setActionError(humanizeScriptError(error, "save"));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!accessToken || !isolatedCurrent || pending || !canConfirmScript(isolatedCurrent.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await confirmScript(accessToken, isolatedCurrent.id);
      await refreshScripts(updated.id);
      setJustConfirmed(true);
      setEditing(false);
    } catch (error) {
      setActionError(humanizeScriptError(error, "confirm"));
    } finally {
      setPending(false);
    }
  }

  async function archive() {
    if (!accessToken || !isolatedCurrent || pending || !canArchiveScript(isolatedCurrent.status)) {
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      const updated = await archiveScript(accessToken, isolatedCurrent.id);
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
    navigateTopic(next.topicId);
  }

  const queue = selectedPlan ? (
    <ScriptProductionQueue
      items={productionItems}
      currentTopicId={currentProductionTopic?.topicId}
      selectedTopicId={form.topicId}
      scriptReadyCount={0}
      onSelect={requestSelectTopic}
      compact={isCompactQueue}
      projectId={projectId}
      planId={selectedPlan.id}
      scripts={scripts}
      videos={videos}
      generatingTopicId={generating ? form.topicId : null}
    />
  ) : null;

  return (
    <div data-acf-script-workspace>
      <WorkflowPageHeaderV1
        page="script"
        projectId={projectId}
        title="选题与脚本"
        description="为本周选题生成并确认脚本。"
        status={
          selectedPlan ? (
            <p className="acf-caption">
              第{selectedPlan.version}版内容计划 · {topics.length}条内容
            </p>
          ) : null
        }
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "选题与脚本" },
        ]}
      />

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]" aria-busy="true">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {!loading && loadError ? (
        <InlineActionErrorV1 message={loadError} onRetry={() => window.location.reload()} />
      ) : null}

      {!loading && !loadError && usablePlans.length === 0 ? (
        <EmptyState
          title="还不能制作脚本"
          description="先确认本期内容计划。"
          primaryAction={{ label: "返回内容计划", href: contentPlansHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && usablePlans.length > 0 ? (
        <div className="space-y-4">
          {queryWarning ? (
            <p className="text-sm text-[var(--acf-danger)]" role="alert">
              {queryWarning}
            </p>
          ) : null}
          {viewingHistoricalPlan ? (
            <p className="rounded-[var(--acf-radius-sm)] border border-[var(--acf-warning)] bg-[var(--acf-warning-soft)] px-3 py-2 text-sm">
              你正在查看历史计划。当前生产仍以最新已确认计划为准。
            </p>
          ) : null}

          {selectedPlan && topics.length === 0 ? (
            <EmptyState
              title="本期计划没有可制作选题。"
              description="返回内容计划检查这一期规划。"
              primaryAction={{ label: "返回内容计划", href: contentPlansHref(projectId) }}
            />
          ) : null}

          <div className="xl:grid xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:items-start xl:gap-8">
            {queue ? (
              <aside className="mb-4 bg-[var(--acf-surface-muted)] xl:sticky xl:top-4 xl:mb-0">{queue}</aside>
            ) : null}

            <div className="min-w-0 bg-[var(--acf-surface)]">
              {selectedTopic && focusItem ? (
                <section className="space-y-4" data-acf-script-current-workspace>
                  <header className="space-y-1">
                    <p className="acf-caption">第 {focusItem.dayIndex} 条</p>
                    <h2 className="acf-section-title">{focusItem.title}</h2>
                    <p className="text-sm">{workspaceStatus}</p>
                    <p className="acf-caption">
                      {[selectedTopic.format || selectedTopic.contentPillar, selectedTopic.targetAudience]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <button className="text-sm text-[var(--acf-text-secondary)] underline" type="button" onClick={() => setTopicDetailOpen(true)}>
                      查看选题详情
                    </button>
                    {draftBesideConfirmed ? (
                      <p className="acf-caption">有一份新的脚本版本等待确认。正式生产仍以已确认脚本为准，直到你确认新版本。</p>
                    ) : null}
                  </header>

                  {canGenerateFromForm(form) && !isolatedCurrent && !generating ? (
                    <div>
                      <p className="text-sm">这条内容还没有脚本</p>
                      <p className="acf-caption mt-1">AI 会根据已确认的选题生成一份可编辑脚本。</p>
                      <Button className="mt-3" type="button" disabled={pending} onClick={() => void generate()}>
                        生成脚本
                      </Button>
                      <span className="sr-only">生成这条脚本</span>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="mt-4 space-y-4">

              {scriptError ? <InlineActionErrorV1 message={scriptError} onRetry={() => void refreshScripts()} /> : null}

              <details className="bg-[var(--acf-surface-muted)] text-sm">
                <summary className="cursor-pointer">生成设置</summary>
                <div className="mt-3">
                  <ScriptSourceForm
                    form={form}
                    plans={usablePlans}
                    selectedPlan={selectedPlan}
                    topics={topics}
                    pending={pending}
                    onChange={changeForm}
                    collapsedByDefault
                    contextLine={
                      selectedTopic
                        ? `已带入选题「${selectedTopic.title}」${selectedTopic.targetAudience ? `、目标用户「${selectedTopic.targetAudience}」` : ""}。不需要再填行业、平台或风格。`
                        : "已根据内容计划带入选题。不需要再填行业或平台。"
                    }
                  />
                </div>
              </details>

              {generating ? (
                <AsyncTaskProgressV1
                  status="RUNNING"
                  label="AI 正在生成脚本"
                  stages={[{ id: "script", label: "正在生成脚本", state: "current" }]}
                  canLeave
                />
              ) : null}

              {actionError ? (
                <InlineActionErrorV1
                  message={actionError.includes("失败") ? actionError : "脚本生成失败，请重试。"}
                  onRetry={() => void generate()}
                />
              ) : null}

              {isolatedCurrent && !currentView ? <p className="text-sm">无法加载这条脚本</p> : null}

              {isolatedCurrent && currentView && editing && draft ? (
                <>
                  <ScriptEditor
                    draft={draft}
                    pending={pending}
                    onChange={(next) => {
                      setDraft(next);
                      setUserEditedDraft(true);
                    }}
                  />
                  <Button type="button" disabled={pending} onClick={() => void saveDraft()}>
                    {pending && saveNotice === "正在保存…" ? "正在保存…" : "保存修改"}
                  </Button>
                  {saveNotice === "已保存" ? <p className="acf-caption">已保存</p> : null}
                </>
              ) : null}

              {isolatedCurrent && currentView && !editing ? <ScriptEditorV2 view={currentView} readOnly /> : null}

              {isolatedCurrent && canConfirmScript(isolatedCurrent.status) ? (
                <>
                  <ScriptReviewPanelV2
                    statusLabel={workspaceStatus}
                    version={isolatedCurrent.version}
                    updatedAt={formatScriptTime(isolatedCurrent.createdAt)}
                    canConfirm={false}
                    pending={pending}
                    onConfirm={() => undefined}
                    onRequestChanges={() => undefined}
                  />
                  <HumanReviewBar
                    context="这条视频脚本"
                    confirmLabel={pending ? "正在确认…" : "确认脚本"}
                    requestChangesLabel="需要修改"
                    onConfirm={() => void confirm()}
                    onRequestChanges={() => {
                      if (currentPayload) {
                        setDraft(currentPayload);
                        setEditing(true);
                      }
                    }}
                  />
                </>
              ) : null}

              {justConfirmed && isolatedCurrent && canGenerateVideo(isolatedCurrent.status) ? (
                <section className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] px-4 py-3">
                  <p className="font-medium">✓ 脚本已确认</p>
                  <p className="acf-caption mt-1">下一步：制作视频</p>
                  <Link
                    className="mt-3 inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
                    href={videoHref(projectId, isolatedCurrent.id)}
                  >
                    制作视频
                  </Link>
                  <span className="sr-only">开始制作视频</span>
                  {currentProductionTopic ? (
                    <button className="ml-3 text-sm underline" type="button" onClick={goNextScriptTopic}>
                      继续制作下一条脚本
                    </button>
                  ) : null}
                </section>
              ) : null}

              {!justConfirmed && isolatedCurrent && canGenerateVideo(isolatedCurrent.status) ? (
                <div>
                  <p className="font-medium">✓ 脚本已确认</p>
                  <ScriptConfirmedActions
                    videoHref={videoHref(projectId, isolatedCurrent.id)}
                    onModify={() => setRegenAsk(true)}
                    onHistory={() => setHistoryOpenSignal((n) => n + 1)}
                  />
                </div>
              ) : null}

              {isolatedCurrent ? (
                <details className="text-sm">
                  <summary className="cursor-pointer">更多操作</summary>
                  <div className="mt-3 space-y-3">
                    <p>重新生成只会生成这一条的新脚本版本，不会改变整套周计划。</p>
                    {canGenerateFromForm(form) ? (
                      !regenAsk ? (
                        <Button variant="secondary" type="button" disabled={pending} onClick={() => setRegenAsk(true)}>
                          重新生成脚本
                        </Button>
                      ) : (
                        <div className="rounded-[var(--acf-radius-md)] border px-3 py-3">
                          <p>重新生成会创建新的脚本版本。当前版本仍会保留。</p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() => {
                                setRegenAsk(false);
                                void generate();
                              }}
                            >
                              继续重新生成
                            </Button>
                            <span className="sr-only">生成新版本</span>
                            <Button variant="secondary" type="button" onClick={() => setRegenAsk(false)}>
                              取消
                            </Button>
                          </div>
                        </div>
                      )
                    ) : null}
                    {canArchiveScript(isolatedCurrent.status) ? (
                      <Button variant="ghost" type="button" disabled={pending} onClick={() => setArchiveAsk(true)}>
                        归档脚本
                      </Button>
                    ) : null}
                    {archiveAsk ? (
                      <div className="rounded-[var(--acf-radius-md)] border px-3 py-3">
                        <p>归档后，这份脚本不再用于视频制作。</p>
                        <div className="mt-2 flex gap-2">
                          <Button type="button" disabled={pending} onClick={() => void archive()}>
                            确认归档
                          </Button>
                          <Button variant="secondary" type="button" onClick={() => setArchiveAsk(false)}>
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {form.topicId ? (
                <div key={historyOpenSignal}>
                  <ScriptHistory
                    items={scriptHistoryViews(topicScripts)}
                    resolveRecord={(version) => topicScripts.find((item) => item.version === version) ?? null}
                    currentVersion={isolatedCurrent?.version}
                  />
                </div>
              ) : null}

              {nextAction.kind === "COMPLETE" && selectedPlan ? (
                <p className="text-sm">本期脚本已全部完成。点左侧队列可查看任意一条。</p>
              ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {topicDetailOpen && topicCard && selectedPlan ? (
        <TopicDetailDrawerV1
          topic={topicCard}
          userLabel={workspaceStatus}
          ctaLabel="关闭"
          ctaHref={null}
          canScript={false}
          readOnly
          onClose={() => setTopicDetailOpen(false)}
        />
      ) : null}

      {pendingSwitchTopicId ? (
        <Dialog open title="当前修改尚未保存。" onClose={() => setPendingSwitchTopicId(null)}>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                const target = pendingSwitchTopicId;
                void saveDraft().then(() => {
                  if (target) navigateTopic(target);
                });
              }}
            >
              保存并切换
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                const target = pendingSwitchTopicId;
                setEditing(false);
                setDraft(null);
                setUserEditedDraft(false);
                if (target) navigateTopic(target);
              }}
            >
              放弃修改
            </Button>
            <Button variant="ghost" type="button" onClick={() => setPendingSwitchTopicId(null)}>
              取消
            </Button>
          </div>
        </Dialog>
      ) : null}

      <NextActionBarV1
        backHref={flow.back?.href}
        backLabel="内容计划"
        currentLabel="选题与脚本"
        nextHref={flow.next?.href}
        nextLabel="视频制作"
      />
    </div>
  );
}

function topicToCard(topic: ContentTopicRecord): TopicCardView {
  return {
    id: topic.id ?? "",
    dayIndex: topic.dayIndex ?? 1,
    title: topic.title ?? "",
    contentAngle: topic.contentAngle,
    contentPillar: topic.contentPillar,
    targetAudience: topic.targetAudience,
    estimatedDuration: topic.estimatedDuration,
    hook: topic.hook,
    reason: topic.reason,
    cta: topic.cta,
    painPoint: topic.painPoint,
    format: topic.format,
  };
}

export default function ContentScriptsPage() {
  return (
    <Suspense fallback={<p className="text-sm">正在加载脚本工作区…</p>}>
      <ContentScriptsPageInner />
    </Suspense>
  );
}
