"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GuidedIntakeShell } from "../../../../../components/intake/guided-intake-shell";
import { IntakeConversation } from "../../../../../components/intake/intake-conversation";
import { IntakeStatusBadge } from "../../../../../components/intake/intake-status-badge";
import { ProductIntakeDraftPanel } from "../../../../../components/intake/product-intake-draft-panel";
import { PageHeader } from "../../../../../components/page-header";
import { ProductBriefForm } from "../../../../../components/product-brief-form";
import { ProductBriefHistory } from "../../../../../components/product-brief-history";
import { ProductBriefSummary } from "../../../../../components/product-brief-summary";
import { useAuth } from "../../../../../lib/auth-context";
import { createProductBrief, getCurrentProductBrief, listProductBriefs } from "../../../../../lib/product-brief.api";
import {
  emptyProductBriefForm,
  formFromPayload,
  historyBriefs,
  humanizeProductBriefSaveError,
  payloadFromForm,
  positioningHref,
  validateProductBriefForm,
  type ProductBriefFieldErrors,
  type ProductBriefFormState,
} from "../../../../../lib/product-brief.form";
import type { ProductBriefRecord } from "../../../../../lib/product-brief.types";
import {
  applyProductIntakeSuggestion,
  clearProductIntakeSession,
  createFreshGuidedSession,
  createMessageId,
  createRefineSessionFromBrief,
  getProductIntakeReadiness,
  humanizeProductIntakeConfirmError,
  loadProductIntakeSession,
  mapProductIntakeDraftToCreateDto,
  patchProductIntakeDraft,
  resolveProductIntakeState,
  saveProductIntakeSession,
} from "../../../../../lib/product-intake";
import { postProductIntakeTurn } from "../../../../../lib/product-intake.api";
import type {
  IntakeSuggestion,
  ProductIntakeDraft,
  ProductIntakeFieldKey,
  ProductIntakeSession,
  ProductIntakeViewMode,
} from "../../../../../lib/product-intake.types";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";

const TURN_FAILURE_MESSAGE =
  "这次没有整理成功，你刚才输入的内容仍然保留，可以重试。";

export default function ProductInformationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();

  const [current, setCurrent] = useState<ProductBriefRecord | null>(null);
  const [history, setHistory] = useState<ProductBriefRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<ProductIntakeViewMode>("guided");
  const [session, setSession] = useState<ProductIntakeSession | null>(null);
  const [pending, setPending] = useState(false);
  const [turnPending, setTurnPending] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [lastFailedUserMessage, setLastFailedUserMessage] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [manualForm, setManualForm] = useState<ProductBriefFormState>(emptyProductBriefForm());
  const [manualErrors, setManualErrors] = useState<ProductBriefFieldErrors>({});
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.all([getCurrentProductBrief(accessToken, projectId), listProductBriefs(accessToken, projectId)])
      .then(([brief, briefs]) => {
        if (cancelled) {
          return;
        }
        setCurrent(brief);
        setHistory(historyBriefs(briefs, brief));
        setLoadError(null);

        const stored = loadProductIntakeSession(projectId);
        if (stored?.active) {
          setSession(stored);
          setMode("guided");
          setSaved(false);
          return;
        }
        if (brief) {
          setSession(null);
          setMode("confirmed");
          return;
        }
        const fresh = createFreshGuidedSession({
          industry: project.industry ?? undefined,
          description: project.description ?? undefined,
        });
        saveProductIntakeSession(projectId, fresh);
        setSession(fresh);
        setMode("guided");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("暂时无法加载产品信息");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId, project.industry, project.description]);

  const draft = useMemo(() => session?.draft ?? {}, [session?.draft]);
  const readiness = useMemo(() => getProductIntakeReadiness(draft), [draft]);
  const intakeActive = Boolean(session?.active) || mode === "guided" || mode === "manual";
  const intakeState = useMemo(
    () =>
      resolveProductIntakeState({
        hasCurrentBrief: Boolean(current),
        draft,
        active: intakeActive,
      }),
    [current, draft, intakeActive],
  );

  function persist(next: ProductIntakeSession) {
    setSession(next);
    saveProductIntakeSession(projectId, next);
  }

  function startGuidedFromScratch() {
    const fresh = createFreshGuidedSession({
      industry: project.industry ?? undefined,
      description: project.description ?? undefined,
    });
    setConfirmError(null);
    setSaved(false);
    setMode("guided");
    persist(fresh);
  }

  function startGuidedRefine() {
    if (!current) {
      startGuidedFromScratch();
      return;
    }
    const next = createRefineSessionFromBrief(current.payload);
    setConfirmError(null);
    setSaved(false);
    setMode("guided");
    persist(next);
  }

  function startManual() {
    setManualForm(
      current
        ? formFromPayload(current.payload)
        : emptyProductBriefForm({
            industry: project.industry ?? "",
            description: project.description ?? "",
          }),
    );
    setManualErrors({});
    setManualSaveError(null);
    setConfirmError(null);
    setSaved(false);
    setMode("manual");
    // Keep session active flag so state is not CONFIRMED while editing manually without brief changes saved.
    if (session) {
      persist({ ...session, active: true, updatedAt: new Date().toISOString() });
    } else {
      const placeholder = createFreshGuidedSession(
        current
          ? undefined
          : {
              industry: project.industry ?? undefined,
              description: project.description ?? undefined,
            },
      );
      if (current) {
        placeholder.draft = {
          productName: current.payload.productName,
          industry: current.payload.industry,
          businessGoal: current.payload.businessGoal,
          targetAudience: current.payload.targetAudience,
          description: current.payload.description,
          sellingPoints: current.payload.sellingPoints,
        };
      }
      persist(placeholder);
    }
  }

  function cancelToConfirmed() {
    if (current) {
      clearProductIntakeSession(projectId);
      setSession(null);
      setMode("confirmed");
      setConfirmError(null);
      setManualSaveError(null);
      return;
    }
    startGuidedFromScratch();
  }

  function updateDraftField(field: ProductIntakeFieldKey, value: string | string[]) {
    if (!session) {
      return;
    }
    const patched = patchProductIntakeDraft(session.draft, { [field]: value }, session.provenance);
    persist({
      ...session,
      draft: patched.draft,
      provenance: patched.provenance,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async function executeProductIntakeTurn(
    content: string,
    sessionWithUser: ProductIntakeSession,
    historyBeforeUser: ProductIntakeSession["messages"],
  ) {
    if (!accessToken || !projectId || turnPending) {
      return;
    }
    setTurnPending(true);
    setTurnError(null);
    setLastFailedUserMessage(null);

    const historyForApi = historyBeforeUser
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-12)
      .map((item) => ({ role: item.role as "user" | "assistant", content: item.content }));

    try {
      const response = await postProductIntakeTurn(accessToken, projectId, {
        clientTurnId: createMessageId(),
        userMessage: content,
        draft: sessionWithUser.draft,
        messages: historyForApi,
        improvingExisting: Boolean(current),
        locale: "zh-CN",
      });
      const merged = patchProductIntakeDraft(
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
          status: "pending" as const,
        })),
      };
      persist({
        ...sessionWithUser,
        draft: merged.draft,
        provenance: merged.provenance,
        messages: [...sessionWithUser.messages, assistantMessage],
        active: true,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setTurnError(TURN_FAILURE_MESSAGE);
      setLastFailedUserMessage(content);
    } finally {
      setTurnPending(false);
    }
  }

  function handleSend(content: string) {
    if (!session || turnPending || pending) {
      return;
    }
    const now = new Date().toISOString();
    const userMessage = {
      id: createMessageId(),
      role: "user" as const,
      content,
      createdAt: now,
    };
    const withUser: ProductIntakeSession = {
      ...session,
      messages: [...session.messages, userMessage],
      active: true,
      updatedAt: now,
    };
    persist(withUser);
    void executeProductIntakeTurn(content, withUser, session.messages);
  }

  function handleRetryTurn() {
    if (!session || !lastFailedUserMessage || turnPending) {
      return;
    }
    const last = session.messages[session.messages.length - 1];
    if (last?.role === "user" && last.content === lastFailedUserMessage) {
      void executeProductIntakeTurn(lastFailedUserMessage, session, session.messages.slice(0, -1));
      return;
    }
    const now = new Date().toISOString();
    const userMessage = {
      id: createMessageId(),
      role: "user" as const,
      content: lastFailedUserMessage,
      createdAt: now,
    };
    const withUser: ProductIntakeSession = {
      ...session,
      messages: [...session.messages, userMessage],
      active: true,
      updatedAt: now,
    };
    persist(withUser);
    void executeProductIntakeTurn(lastFailedUserMessage, withUser, session.messages);
  }

  function adoptSuggestion(messageId: string, suggestion: IntakeSuggestion) {
    if (!session || turnPending) {
      return;
    }
    const applied = applyProductIntakeSuggestion(session.draft, session.provenance, suggestion);
    const messages = session.messages.map((message) => {
      if (message.id !== messageId || !message.suggestions) {
        return message;
      }
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
    if (!session) {
      return;
    }
    const messages = session.messages.map((message) => {
      if (message.id !== messageId || !message.suggestions) {
        return message;
      }
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

  async function confirmGuided() {
    if (!accessToken || !projectId || !session || !readiness.readyForConfirmation || pending || turnPending) {
      return;
    }
    setPending(true);
    setConfirmError(null);
    try {
      const payload = mapProductIntakeDraftToCreateDto(session.draft);
      const created = await createProductBrief(accessToken, projectId, payload);
      const briefs = await listProductBriefs(accessToken, projectId);
      clearProductIntakeSession(projectId);
      setSession(null);
      setCurrent(created);
      setHistory(historyBriefs(briefs, created));
      setMode("confirmed");
      setSaved(true);
    } catch (error) {
      setConfirmError(humanizeProductIntakeConfirmError(error));
    } finally {
      setPending(false);
    }
  }

  async function saveManual() {
    if (!accessToken || !projectId || pending) {
      return;
    }
    const errors = validateProductBriefForm(manualForm);
    if (Object.keys(errors).length > 0) {
      setManualErrors(errors);
      return;
    }
    setPending(true);
    setManualErrors({});
    setManualSaveError(null);
    try {
      const created = await createProductBrief(accessToken, projectId, payloadFromForm(manualForm));
      const briefs = await listProductBriefs(accessToken, projectId);
      clearProductIntakeSession(projectId);
      setSession(null);
      setCurrent(created);
      setHistory(historyBriefs(briefs, created));
      setMode("confirmed");
      setSaved(true);
    } catch (error) {
      setManualSaveError(humanizeProductBriefSaveError(error));
    } finally {
      setPending(false);
    }
  }

  const nextHref = positioningHref(projectId);
  const showGuided = !loading && !loadError && mode === "guided" && session;
  const showManual = !loading && !loadError && mode === "manual";
  const showConfirmed = !loading && !loadError && mode === "confirmed" && current;

  return (
    <div className="min-w-0">
      <PageHeader
        title="产品信息"
        description="AI 会通过几个问题了解你的产品，并整理成后续账号定位需要的信息。"
        breadcrumb={`项目 / ${project.name} / 产品信息`}
        actions={<IntakeStatusBadge state={intakeState} />}
      />

      {loading ? <p className="text-sm text-neutral-600">正在加载产品信息…</p> : null}
      {!loading && loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

      {!loading && !loadError && saved ? (
        <div className="mb-4 space-y-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-900" role="status">
          <p>产品信息已确认，可以开始账号定位。</p>
          <Link className="inline-flex rounded-md bg-neutral-950 px-4 py-2 text-white" href={nextHref}>
            开始账号定位
          </Link>
        </div>
      ) : null}

      {showConfirmed ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={startGuidedRefine}>
              和 AI 继续完善
            </button>
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={startManual}>
              手动编辑
            </button>
            <Link className="rounded-md border px-4 py-2 text-sm" href={nextHref}>
              开始账号定位
            </Link>
          </div>
          <p className="text-xs text-neutral-500">版本 {current.version}</p>
          <ProductBriefSummary payload={current.payload} />
          {accessToken ? <ProductBriefHistory items={history} accessToken={accessToken} /> : null}
        </div>
      ) : null}

      {showManual ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={() => setMode("guided")}>
              返回 AI 引导
            </button>
            {current ? (
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={cancelToConfirmed}>
                取消
              </button>
            ) : null}
          </div>
          {manualSaveError ? (
            <p className="text-sm text-red-600" role="alert">
              {manualSaveError}
            </p>
          ) : null}
          <ProductBriefForm
            form={manualForm}
            errors={manualErrors}
            pending={pending}
            isNewVersion={Boolean(current)}
            onChange={setManualForm}
            onSubmit={() => void saveManual()}
            onCancel={cancelToConfirmed}
          />
        </div>
      ) : null}

      {showGuided ? (
        <div className="flex min-h-0 flex-col gap-3" data-acf-page-type="workspace">
          <div className="flex shrink-0 flex-wrap gap-2">
            <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={startManual}>
              手动填写
            </button>
            {current ? (
              <button className="rounded-md border px-3 py-1.5 text-sm" type="button" onClick={cancelToConfirmed}>
                返回已确认版本
              </button>
            ) : null}
          </div>
          {confirmError ? (
            <p className="shrink-0 text-sm text-red-600" role="alert">
              {confirmError}
            </p>
          ) : null}
          <GuidedIntakeShell
            conversation={
              <IntakeConversation
                messages={session.messages}
                disabled={pending || turnPending}
                turnError={turnError}
                onSend={handleSend}
                onRetry={lastFailedUserMessage ? handleRetryTurn : undefined}
                onAdoptSuggestion={adoptSuggestion}
                onIgnoreSuggestion={ignoreSuggestion}
              />
            }
            draft={
              <ProductIntakeDraftPanel
                draft={session.draft as ProductIntakeDraft}
                readiness={readiness}
                pending={pending || turnPending}
                onChange={updateDraftField}
                onConfirm={() => void confirmGuided()}
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}
