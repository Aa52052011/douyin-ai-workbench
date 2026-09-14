"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GuidedIntakeShell } from "../../../../../../components/intake/guided-intake-shell";
import { MarketIntakeConversation } from "../../../../../../components/intake/market-intake-conversation";
import { MarketIntakeDraftPanel } from "../../../../../../components/intake/market-intake-draft-panel";
import { MarketIntakeStatusBadge } from "../../../../../../components/intake/market-intake-status-badge";
import { MarketImportWizard } from "../../../../../../components/market-import-wizard";
import { MarketResearchHistory } from "../../../../../../components/market-research-history";
import { ReferenceIntelligencePanel } from "../../../../../../components/intake/reference-intelligence-panel";
import { PageHeader } from "../../../../../../components/page-header";
import { useAuth } from "../../../../../../lib/auth-context";
import {
  acknowledgeLimitedData,
  adoptProductSeedKeywords,
  applyMarketIntakeSuggestion,
  clearMarketIntakeSession,
  createContinueMarketSession,
  createFreshGuidedMarketSession,
  createMessageId,
  draftToTurnPayload,
  getMarketIntakeReadiness,
  humanizeMarketIntakeConfirmError,
  loadMarketIntakeSession,
  mapMarketIntakeDraftToManualPreview,
  mergeExtractedUrlSources,
  patchMarketIntakeDraft,
  productBriefHasSeedKeywords,
  researchSummaryLabel,
  resolveMarketIntakeState,
  saveMarketIntakeSession,
  sanitizeMarketIntakeDraft,
} from "../../../../../../lib/market-intake";
import {
  confirmManualMarketResearch,
  postMarketIntakeTurn,
  previewManualMarketResearch,
} from "../../../../../../lib/market-intake.api";
import type {
  MarketIntakeDraft,
  MarketIntakeSession,
  MarketIntakeSuggestion,
  MarketIntakeViewMode,
} from "../../../../../../lib/market-intake.types";
import { getCurrentProductBrief } from "../../../../../../lib/product-brief.api";
import type { ProductBriefRecord } from "../../../../../../lib/product-brief.types";
import { listMarketResearch } from "../../../../../../lib/market-research.api";
import {
  marketAnalysisHref,
  productInformationHref,
  sortResearchNewestFirst,
} from "../../../../../../lib/market-research.form";
import type { MarketResearchRecord } from "../../../../../../lib/market-research.types";
import { useProjectWorkspace } from "../../../../../../lib/project-workspace-context";

const TURN_FAILURE_MESSAGE = "这次没有整理成功，你刚才的信息仍然保留，可以重试。";
const PRODUCT_BRIEF_REQUIRED_MESSAGE = "请先完成产品信息，再开始市场调研。";

export default function MarketResearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();

  const [brief, setBrief] = useState<ProductBriefRecord | null>(null);
  const [items, setItems] = useState<MarketResearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<MarketIntakeViewMode>("guided");
  const [session, setSession] = useState<MarketIntakeSession | null>(null);
  const [pending, setPending] = useState(false);
  const [turnPending, setTurnPending] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [lastFailedUserMessage, setLastFailedUserMessage] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([getCurrentProductBrief(accessToken, projectId), listMarketResearch(accessToken, projectId)]).then(
      ([briefResult, listResult]) => {
        if (cancelled) {
          return;
        }
        if (listResult.status === "rejected") {
          setLoadError("无法加载市场调研，请刷新重试。");
          setLoading(false);
          return;
        }
        const researches = sortResearchNewestFirst(listResult.value);
        setItems(researches);
        const currentBrief = briefResult.status === "fulfilled" ? briefResult.value : null;
        setBrief(currentBrief);
        setLoadError(null);

        const stored = loadMarketIntakeSession(projectId);
        if (stored?.active) {
          setSession(stored);
          setMode("guided");
          setSaved(false);
        } else if (researches.length > 0) {
          setSession(null);
          setMode("confirmed");
        } else if (currentBrief) {
          const fresh = createFreshGuidedMarketSession();
          saveMarketIntakeSession(projectId, fresh);
          setSession(fresh);
          setMode("guided");
        } else {
          setSession(null);
          setMode("guided");
        }
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  const draft = useMemo(() => (session ? sanitizeMarketIntakeDraft(session.draft) : sanitizeMarketIntakeDraft({})), [session]);
  const readiness = useMemo(() => getMarketIntakeReadiness(draft), [draft]);
  const intakeActive = Boolean(session?.active) || mode === "guided";
  const intakeState = useMemo(
    () =>
      resolveMarketIntakeState({
        hasResearch: items.length > 0,
        draft,
        active: intakeActive && mode === "guided",
      }),
    [items.length, draft, intakeActive, mode],
  );

  function persist(next: MarketIntakeSession) {
    setSession(next);
    saveMarketIntakeSession(projectId, next);
  }

  function startGuidedFromScratch() {
    const fresh = createFreshGuidedMarketSession();
    persist(fresh);
    setMode("guided");
    setConfirmError(null);
    setSaved(false);
  }

  function startContinue() {
    const next = createContinueMarketSession();
    persist(next);
    setMode("guided");
    setConfirmError(null);
    setSaved(false);
  }

  function cancelToConfirmed() {
    if (items.length > 0) {
      clearMarketIntakeSession(projectId);
      setSession(null);
      setMode("confirmed");
      setConfirmError(null);
      return;
    }
    startGuidedFromScratch();
  }

  function updateDraft(nextDraft: MarketIntakeDraft) {
    if (!session) return;
    persist({
      ...session,
      draft: sanitizeMarketIntakeDraft(nextDraft),
      provenance: { ...session.provenance },
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleSend(content: string) {
    if (!session || turnPending || pending) return;
    const now = new Date().toISOString();
    const merged = mergeExtractedUrlSources(session.draft, content);
    const userMessage = {
      id: createMessageId(),
      role: "user" as const,
      content,
      createdAt: now,
    };
    const assistantNote =
      merged.added > 0
        ? {
            id: createMessageId(),
            role: "assistant" as const,
            content:
              merged.duplicates > 0
                ? `已识别 ${merged.added} 条链接并记为市场研究资料草稿；${merged.duplicates} 条已存在。可在右侧改用途（爆款参考 / 我的历史内容）。`
                : `已识别 ${merged.added} 条链接并记为市场研究资料草稿。可在右侧改用途（爆款参考 / 我的历史内容）。`,
            createdAt: now,
            localKind: "LOCAL_PLACEHOLDER_REPLY" as const,
          }
        : null;
    const withUser: MarketIntakeSession = {
      ...session,
      draft: merged.draft,
      messages: [...session.messages, userMessage, ...(assistantNote ? [assistantNote] : [])],
      active: true,
      updatedAt: now,
    };
    persist(withUser);
    void executeMarketIntakeTurn(content, withUser, session.messages);
  }

  async function executeMarketIntakeTurn(
    content: string,
    sessionWithUser: MarketIntakeSession,
    historyBeforeUser: MarketIntakeSession["messages"],
  ) {
    if (!accessToken || !projectId || turnPending) return;
    setTurnPending(true);
    setTurnError(null);
    setLastFailedUserMessage(null);

    const historyForApi = historyBeforeUser
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-12)
      .map((item) => ({ role: item.role as "user" | "assistant", content: item.content }));

    try {
      const response = await postMarketIntakeTurn(accessToken, projectId, {
        clientTurnId: createMessageId(),
        userMessage: content,
        draft: draftToTurnPayload(sessionWithUser.draft),
        messages: historyForApi,
        improvingExisting: items.length > 0,
        userAcknowledgedLimitedData: sessionWithUser.draft.userAcknowledgedLimitedData,
        locale: "zh-CN",
      });
      const merged = patchMarketIntakeDraft(
        sessionWithUser.draft,
        response.draftPatch ?? {},
        sessionWithUser.provenance,
        "USER_PROVIDED",
      );
      const assistantMessage = {
        id: createMessageId(),
        role: "assistant" as const,
        content: response.message,
        createdAt: new Date().toISOString(),
        suggestions: (response.suggestions ?? []).map((item) => ({
          id: item.id,
          field: item.field,
          value: item.value,
          ...(item.label ? { label: item.label } : {}),
          ...(item.rationale ? { rationale: item.rationale } : {}),
          status: "pending" as const,
        })),
      };
      persist({
        ...sessionWithUser,
        draft: {
          ...merged.draft,
          userAcknowledgedLimitedData: sessionWithUser.draft.userAcknowledgedLimitedData,
        },
        provenance: merged.provenance,
        messages: [...sessionWithUser.messages, assistantMessage],
        active: true,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      setTurnError(code === "PRODUCT_BRIEF_REQUIRED" ? PRODUCT_BRIEF_REQUIRED_MESSAGE : TURN_FAILURE_MESSAGE);
      setLastFailedUserMessage(content);
    } finally {
      setTurnPending(false);
    }
  }

  function handleRetryTurn() {
    if (!session || !lastFailedUserMessage || turnPending) return;
    const last = session.messages[session.messages.length - 1];
    if (last?.role === "user" && last.content === lastFailedUserMessage) {
      void executeMarketIntakeTurn(lastFailedUserMessage, session, session.messages.slice(0, -1));
      return;
    }
    const now = new Date().toISOString();
    const userMessage = {
      id: createMessageId(),
      role: "user" as const,
      content: lastFailedUserMessage,
      createdAt: now,
    };
    const withUser: MarketIntakeSession = {
      ...session,
      messages: [...session.messages, userMessage],
      active: true,
      updatedAt: now,
    };
    persist(withUser);
    void executeMarketIntakeTurn(lastFailedUserMessage, withUser, session.messages);
  }

  function adoptSuggestion(messageId: string, suggestion: MarketIntakeSuggestion) {
    if (!session || turnPending) return;
    const applied = applyMarketIntakeSuggestion(session.draft, session.provenance, suggestion);
    const messages = session.messages.map((message) => {
      if (message.id !== messageId || !message.suggestions) return message;
      return {
        ...message,
        suggestions: message.suggestions.map((item) =>
          item.id === suggestion.id ? { ...item, status: "adopted" as const } : item,
        ),
      };
    });
    persist({
      ...session,
      draft: applied.draft,
      provenance: applied.provenance,
      messages,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  function ignoreSuggestion(messageId: string, suggestionId: string) {
    if (!session) return;
    const messages = session.messages.map((message) => {
      if (message.id !== messageId || !message.suggestions) return message;
      return {
        ...message,
        suggestions: message.suggestions.map((item) =>
          item.id === suggestionId ? { ...item, status: "ignored" as const } : item,
        ),
      };
    });
    persist({
      ...session,
      messages,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleAcknowledgeNoData() {
    if (!session || pending || turnPending) return;
    const next = acknowledgeLimitedData(session.draft, session.provenance);
    persist({
      ...session,
      draft: next.draft,
      provenance: next.provenance,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleAdoptSeedKeywords() {
    if (!session || !brief || pending || turnPending) return;
    const next = adoptProductSeedKeywords(session.draft, brief.payload.seedKeywords, session.provenance);
    persist({
      ...session,
      draft: next.draft,
      provenance: next.provenance,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async function confirmGuided() {
    if (!accessToken || !projectId || !session || !brief || !readiness.readyForConfirmation || pending) {
      return;
    }
    setPending(true);
    setConfirmError(null);
    try {
      const body = mapMarketIntakeDraftToManualPreview(session.draft, {
        productBriefId: brief.id,
        collectedAt: new Date().toISOString(),
      });
      await previewManualMarketResearch(accessToken, projectId, body);
      await confirmManualMarketResearch(accessToken, projectId, body);
      const rows = await listMarketResearch(accessToken, projectId);
      clearMarketIntakeSession(projectId);
      setSession(null);
      setItems(sortResearchNewestFirst(rows));
      setMode("confirmed");
      setSaved(true);
    } catch (error) {
      setConfirmError(humanizeMarketIntakeConfirmError(error));
    } finally {
      setPending(false);
    }
  }

  async function refreshList() {
    if (!accessToken || !projectId) return;
    const rows = await listMarketResearch(accessToken, projectId);
    setItems(sortResearchNewestFirst(rows));
  }

  const latest = items[0] ?? null;
  const showGuided = !loading && !loadError && Boolean(brief) && mode === "guided" && session;
  const showConfirmed = !loading && !loadError && mode === "confirmed" && items.length > 0;
  const showNoBrief = !loading && !loadError && !brief;

  return (
    <div className="min-w-0">
      <PageHeader
        title="市场调研"
        description="AI 会帮你整理关键词、竞品线索和市场观察，这些信息将用于后续市场分析。不需要拥有竞品后台数据。"
        breadcrumb={`项目 / ${project.name} / 市场调研`}
        actions={<MarketIntakeStatusBadge state={intakeState} />}
      />

      {loading ? <p className="text-sm text-neutral-600">正在加载市场调研…</p> : null}
      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {showNoBrief ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p>请先完成产品信息，AI 才能结合你的产品进行市场调研。</p>
          <Link className="mt-2 inline-block rounded-md bg-neutral-950 px-4 py-2 text-white" href={productInformationHref(projectId)}>
            去完善产品信息
          </Link>
        </div>
      ) : null}

      {!loading && !loadError && brief ? (
        <p className="mb-4 text-sm text-neutral-600">
          当前产品：{brief.payload.productName}
          {brief.payload.industry ? ` · ${brief.payload.industry}` : ""}
        </p>
      ) : null}

      {!loading && !loadError && saved ? (
        <div className="mb-4 space-y-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-900" role="status">
          <p>市场调研已确认，可以开始市场分析。</p>
          <Link className="inline-flex rounded-md bg-neutral-950 px-4 py-2 text-white" href={marketAnalysisHref(projectId)}>
            开始市场分析
          </Link>
        </div>
      ) : null}

      {showConfirmed ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={startContinue}>
              和 AI 继续补充调研
            </button>
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={() => setImporting(true)}>
              导入已有市场数据
            </button>
            <Link className="rounded-md border px-4 py-2 text-sm" href={marketAnalysisHref(projectId)}>
              查看市场分析
            </Link>
          </div>
          {latest ? (
            <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
              <p className="font-medium">最新调研</p>
              <p className="mt-1 text-neutral-600">
                版本 {latest.version}
                {latest.queryContext?.source ? ` · 来源 ${latest.queryContext.source}` : ""}
                {latest.createdAt ? ` · ${new Date(latest.createdAt).toLocaleString()}` : ""}
              </p>
              <p className="mt-1 text-neutral-600">{researchSummaryLabel(latest)}</p>
              {(latest.queryContext?.itemCount === 0 ||
                (latest.snapshot?.sampleStats &&
                  (latest.snapshot.sampleStats.keywordCount ?? 0) +
                    (latest.snapshot.sampleStats.competitorCount ?? 0) +
                    (latest.snapshot.sampleStats.contentCount ?? 0) ===
                    0)) && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  目前市场信息较少，第一轮分析会更多依赖产品信息和你已确认的研究方向。后续补充竞品或真实市场数据，可以提升判断准确度。
                </p>
              )}
            </div>
          ) : null}
          <div>
            <h2 className="mb-2 text-sm font-medium">历史调研</h2>
            <MarketResearchHistory items={items} />
          </div>
        </div>
      ) : null}

      {showGuided ? (
        <div className="flex min-h-0 flex-col gap-3" data-acf-page-type="workspace">
          <div className="flex shrink-0 flex-wrap gap-2">
            {items.length > 0 ? (
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={cancelToConfirmed}>
                返回已确认调研
              </button>
            ) : null}
            {productBriefHasSeedKeywords(brief?.payload) && draft.keywords.length === 0 ? (
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={handleAdoptSeedKeywords}>
                采用产品关键词
              </button>
            ) : null}
          </div>
          {productBriefHasSeedKeywords(brief?.payload) && draft.keywords.length === 0 ? (
            <p className="shrink-0 text-xs text-neutral-600">我们可以先使用你在产品信息中确认过的关键词作为第一轮市场调研方向。</p>
          ) : null}
          {confirmError ? (
            <p className="shrink-0 text-sm text-red-600" role="alert">
              {confirmError}
            </p>
          ) : null}
          <GuidedIntakeShell
            conversation={
              <MarketIntakeConversation
                messages={session.messages}
                disabled={pending || turnPending}
                onSend={handleSend}
                showNoDataAction={!draft.userAcknowledgedLimitedData && !readiness.hasResearchMaterial}
                onAcknowledgeNoData={handleAcknowledgeNoData}
                onOpenImport={() => setImporting(true)}
                onAdoptSuggestion={adoptSuggestion}
                onIgnoreSuggestion={ignoreSuggestion}
                turnError={turnError}
                onRetryTurn={handleRetryTurn}
              />
            }
            draft={
              <MarketIntakeDraftPanel
                draft={draft}
                readiness={readiness}
                pending={pending || turnPending}
                onChangeDraft={updateDraft}
                onConfirm={() => void confirmGuided()}
                projectId={projectId}
                accessToken={accessToken ?? undefined}
              />
            }
          />
        </div>
      ) : null}

      {importing && accessToken && brief ? (
        <MarketImportWizard
          projectId={projectId}
          accessToken={accessToken}
          productBriefId={brief.id}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            setSaved(true);
            clearMarketIntakeSession(projectId);
            setSession(null);
            setMode("confirmed");
            void refreshList();
          }}
        />
      ) : null}

      {accessToken ? (
        <ReferenceIntelligencePanel projectId={projectId} accessToken={accessToken} />
      ) : null}
    </div>
  );
}
