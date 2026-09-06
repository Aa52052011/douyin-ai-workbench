"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/empty-state";
import { PageHeader } from "../../../../../../components/page-header";
import { ScriptDetail } from "../../../../../../components/script-detail";
import { ScriptEditor } from "../../../../../../components/script-editor";
import { ScriptHistory } from "../../../../../../components/script-history";
import { ScriptSourceForm } from "../../../../../../components/script-source-form";
import { useAuth } from "../../../../../../lib/auth-context";
import { listContentPlans } from "../../../../../../lib/content-planning.api";
import { planStatusLabel } from "../../../../../../lib/content-planning.view";
import type { ContentPlanRecord, ContentTopicRecord } from "../../../../../../lib/content-planning.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";
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
  hintDurationFromTopic,
  humanizeScriptError,
  latestScriptForTopic,
  resolveScriptQuery,
  scriptsForTopic,
  topicsForPlan,
  videoHref,
} from "../../../../../../lib/script.form";
import type { ScriptFormState, ScriptPayloadRecord, ScriptRecord } from "../../../../../../lib/script.types";
import {
  parseScriptPayload,
  parsedScriptView,
  parseTopicSnapshot,
  recentScriptViews,
  scriptHistoryViews,
  scriptStatusLabel,
  topicSourceView,
} from "../../../../../../lib/script.view";

function ContentScriptsPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const queryPlanId = searchParams.get("contentPlanId");
  const queryTopicId = searchParams.get("topicId");
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [plans, setPlans] = useState<ContentPlanRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [form, setForm] = useState<ScriptFormState>(emptyScriptForm());
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [draft, setDraft] = useState<ScriptPayloadRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [queryWarning, setQueryWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([listContentPlans(accessToken, projectId), listScripts(accessToken, projectId)]).then(
      ([planResult, scriptResult]) => {
        if (cancelled) {
          return;
        }
        if (planResult.status === "rejected") {
          setLoadError("无法加载脚本所需信息，请刷新重试。");
          setLoading(false);
          return;
        }
        const nextPlans = planResult.value;
        const usable = eligiblePlans(nextPlans);
        const resolved = resolveScriptQuery(queryPlanId, queryTopicId, usable);
        const selectedPlan = usable.find((item) => item.id === resolved.contentPlanId) ?? null;
        const selectedTopic = topicsForPlan(selectedPlan).find((item) => item.id === resolved.topicId);
        setPlans(nextPlans);
        setQueryWarning(resolved.warning);
        setForm({
          ...emptyScriptForm(),
          contentPlanId: resolved.contentPlanId,
          topicId: resolved.topicId,
          targetDuration: hintDurationFromTopic(selectedTopic?.estimatedDuration),
        });
        setSelectedScriptId("");
        setEditing(false);
        setDraft(null);
        if (scriptResult.status === "fulfilled") {
          setScripts(scriptResult.value);
          setScriptError(null);
        } else {
          setScripts([]);
          setScriptError("无法加载脚本。");
        }
        setLoadError(null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, queryPlanId, queryTopicId]);

  const usablePlans = eligiblePlans(plans);
  const selectedPlan = usablePlans.find((item) => item.id === form.contentPlanId) ?? null;
  const topics = topicsForPlan(selectedPlan);
  const selectedTopic = topics.find((item) => item.id === form.topicId) ?? null;
  const topicScripts = form.contentPlanId && form.topicId ? scriptsForTopic(scripts, form.contentPlanId, form.topicId) : [];
  const current = resolveCurrentScript(scripts, form, selectedScriptId);
  const currentView = current ? parsedScriptView(current) : null;
  const currentPayload = current ? parseScriptPayload(current.payload) : null;
  const source = topicSourceView(selectedTopic);
  const recent = recentScriptViews(scripts.filter((item) => !projectId || item.projectId === projectId || !item.projectId));

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
    }
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

  function openRecent(itemId: string) {
    const record = scripts.find((item) => item.id === itemId);
    if (!record) {
      return;
    }
    const plan = usablePlans.find((item) => item.id === record.contentPlanId) ?? null;
    const topic = topicsForPlan(plan).find((item) => item.id === record.topicId);
    if (plan && topic?.id) {
      setForm({
        ...form,
        contentPlanId: plan.id,
        topicId: topic.id,
        targetDuration: hintDurationFromTopic(topic.estimatedDuration),
      });
    }
    setSelectedScriptId(record.id);
    setEditing(false);
    setDraft(null);
  }

  const actions = current ? (
    <aside className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <p className="text-neutral-600">
        编辑会修改当前草稿内容。重新生成会基于同一选题创建新的脚本版本。
      </p>
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
          <p className="text-neutral-600">确认后即可进入视频制作。</p>
        </div>
      ) : null}
      {canGenerateVideo(current.status) ? (
        <div className="space-y-2">
          <p className="text-neutral-700">脚本已确认，可以进入视频制作。</p>
          <Link className="block rounded-md bg-neutral-950 px-4 py-2 text-center text-white" href={videoHref(projectId, current.id)}>
            生成视频
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
          <button className="mt-2 w-full rounded-md border px-4 py-2 disabled:opacity-50" type="button" disabled={pending} onClick={() => setArchiveAsk(true)}>
            归档脚本
          </button>
        </details>
      ) : null}
      {archiveAsk ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
          <p>归档后，这份脚本不再用于视频制作。</p>
          <div className="mt-2 flex gap-2">
            <button className="rounded-md bg-neutral-950 px-3 py-1.5 text-white" type="button" disabled={pending} onClick={() => void archive()}>
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
        description="从已确认的内容计划选题生成完整视频脚本，并在确认后进入视频制作。"
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
        <EmptyState
          title="还没有可用的内容计划"
          description="先确认一份内容计划，再从选题生成脚本。"
          primaryAction={{ label: "去内容计划", href: contentPlansHref(projectId) }}
        />
      ) : null}

      {!loading && !loadError && usablePlans.length > 0 ? (
        <div className="space-y-6">
          {queryWarning ? (
            <p className="text-sm text-red-600" role="alert">
              {queryWarning}
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-6">
              <ScriptSourceForm
                form={form}
                plans={usablePlans}
                selectedPlan={selectedPlan}
                topics={topics}
                pending={pending}
                onChange={changeForm}
              />

              {selectedPlan && selectedTopic ? (
                <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                  <h2 className="mb-2 font-medium">当前选题</h2>
                  <p>
                    内容计划：第 {selectedPlan.version} 版 · {planStatusLabel(selectedPlan.status)}
                  </p>
                  <TopicSummary topic={selectedTopic} />
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
                  className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
                  type="button"
                  disabled={pending}
                  onClick={() => void generate()}
                >
                  生成脚本
                </button>
              ) : null}

              {!form.topicId && recent.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-medium">最近脚本</h2>
                  <ul className="space-y-2">
                    {recent.map((item) => (
                      <li key={item.id}>
                        <button
                          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm"
                          type="button"
                          onClick={() => openRecent(item.id)}
                        >
                          <p className="font-medium">{item.title}</p>
                          <p className="text-neutral-600">对应选题：{item.topicTitle}</p>
                          <p className="text-neutral-500">
                            {[item.statusLabel, item.createdAtLabel].filter(Boolean).join(" · ")}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {form.topicId && !current && !pending ? (
                <p className="text-sm text-neutral-600">还没有这个选题的脚本，点击生成脚本开始。</p>
              ) : null}

              {current && !currentView ? <p className="text-sm text-neutral-600">该版本无法读取</p> : null}

              {current && currentView && editing && draft ? <ScriptEditor draft={draft} pending={pending} onChange={setDraft} /> : null}

              {current && currentView && !editing ? (
                <ScriptDetail
                  view={currentView}
                  version={current.version}
                  statusLabel={scriptStatusLabel(current.status)}
                  source={parseTopicSnapshot(current.topicSnapshot) ?? source}
                />
              ) : null}
            </div>
            <div className="lg:sticky lg:top-4 lg:self-start">{actions}</div>
          </div>

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

function TopicSummary({ topic }: { topic: ContentTopicRecord }) {
  return (
    <dl className="mt-3 space-y-1">
      <div>
        <dt className="text-neutral-500">选题</dt>
        <dd className="break-words">{topic.title}</dd>
      </div>
      {topic.contentAngle ? (
        <div>
          <dt className="text-neutral-500">内容角度</dt>
          <dd className="break-words">{topic.contentAngle}</dd>
        </div>
      ) : null}
      {topic.targetAudience ? (
        <div>
          <dt className="text-neutral-500">目标受众</dt>
          <dd className="break-words">{topic.targetAudience}</dd>
        </div>
      ) : null}
      {topic.hook ? (
        <div>
          <dt className="text-neutral-500">Hook</dt>
          <dd className="whitespace-pre-wrap break-words">{topic.hook}</dd>
        </div>
      ) : null}
      {topic.cta ? (
        <div>
          <dt className="text-neutral-500">CTA 方向</dt>
          <dd className="break-words">{topic.cta}</dd>
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
