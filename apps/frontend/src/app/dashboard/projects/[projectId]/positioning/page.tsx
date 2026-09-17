"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../../components/empty-state";
import { PositioningForm } from "../../../../../components/positioning-form";
import { PositioningHistory } from "../../../../../components/positioning-history";
import { PositioningSummary } from "../../../../../components/positioning-summary";
import { ProductionContextHeaderV3 } from "../../../../../components/production-context-header";
import { WorkflowPageHeaderV1 } from "../../../../../components/workflow-page-header-v1";
import { AsyncTaskProgressV1 } from "../../../../../components/async-task-progress-v1";
import { InlineActionErrorV1 } from "../../../../../components/inline-action-error-v1";
import { HumanReviewBar } from "../../../../../components/ui/human-review-bar";
import { useToast } from "../../../../../components/ui/toast";
import { Skeleton } from "../../../../../components/ui/feedback";
import { useAuth } from "../../../../../lib/auth-context";
import { getCurrentProductBrief } from "../../../../../lib/product-brief.api";
import type { ProductBriefPayload } from "../../../../../lib/product-brief.types";
import { executeAndAwaitPositioning, listPositioningRuns } from "../../../../../lib/positioning.api";
import {
  currentPositioningRecord,
  historyPositioningRecords,
  humanizePositioningError,
  inputFromForm,
  isGeneratingStatus,
  latestFailedPositioning,
  onlyContractInput,
  productInformationHref,
  contentPlansHref,
  suggestedPositioningForm,
  validatePositioningForm,
  type PositioningFieldErrors,
} from "../../../../../lib/positioning.form";
import type { PositioningFormState, PositioningRecord } from "../../../../../lib/positioning.types";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";
import type { AgentRun } from "../../../../../lib/types";
import { adjacentProjectNav } from "../../../../../lib/project-nav";
import { NextActionBarV1 } from "../../../../../components/next-action-bar-v1";
import { PositioningFirstStepNotice } from "../../../../../components/positioning-first-step-notice";

export default function AccountPositioningPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [brief, setBrief] = useState<ProductBriefPayload | null>(null);
  const [briefUnavailable, setBriefUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PositioningFormState>(suggestedPositioningForm({}));
  const [fieldErrors, setFieldErrors] = useState<PositioningFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const toast = useToast();
  const flow = adjacentProjectNav(`/dashboard/projects/${projectId}/positioning`, projectId);

  useEffect(() => {
    if (!accessToken || !projectId) {
      return;
    }
    let cancelled = false;
    void Promise.allSettled([
      getCurrentProductBrief(accessToken, projectId),
      listPositioningRuns(accessToken, projectId),
    ]).then(([briefResult, runsResult]) => {
      if (cancelled) {
        return;
      }
      if (runsResult.status === "rejected") {
        setLoadError("无法加载账号定位，请刷新重试。");
        setLoading(false);
        return;
      }
      setRuns(runsResult.value);
      if (briefResult.status === "fulfilled") {
        setBrief(briefResult.value?.payload ?? null);
        setBriefUnavailable(false);
      } else {
        setBrief(null);
        setBriefUnavailable(true);
      }
      setLoadError(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  const current = currentPositioningRecord(runs);
  const history = historyPositioningRecords(runs, current);
  const failed = latestFailedPositioning(runs);
  const showConfirmedCta = Boolean(current) && !needsReview;
  const showOnboardingGuidance = !showConfirmedCta;

  function openForm(record?: PositioningRecord | null) {
    setForm(
      suggestedPositioningForm({
        lastInput: record?.input,
        brief,
        project,
      }),
    );
    setFieldErrors({});
    setGenerateError(null);
    setEditing(true);
    setDirty(false);
    setConfirmed(false);
  }

  async function generate() {
    if (!accessToken || !projectId) {
      return;
    }
    const errors = validatePositioningForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setPending(true);
    setFieldErrors({});
    setGenerateError(null);
    try {
      const finished = await executeAndAwaitPositioning(accessToken, projectId, onlyContractInput(inputFromForm(form)));
      const latest = await listPositioningRuns(accessToken, projectId);
      setRuns(latest);
      setEditing(false);
      setDirty(false);
      setConfirmed(false);
      setNeedsReview(true);
      if (finished.status === "FAILED") {
        setGenerateError("账号定位生成失败，请稍后重试。");
      } else if (isGeneratingStatus(finished.status)) {
        setGenerateError("生成时间较长，请稍后重试。");
      } else {
        toast("账号定位已生成");
      }
    } catch (err) {
      setGenerateError(humanizePositioningError(err));
    } finally {
      setPending(false);
    }
  }

  const reuseHint = Boolean(brief?.targetAudience || project.industry || project.platform);

  return (
    <div>
      <WorkflowPageHeaderV1
        page="positioning"
        projectId={projectId}
        title="账号定位"
        description="看看 AI 现在如何理解你的账号，确认后再进入内容计划。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "账号定位" },
        ]}
      />
      {showOnboardingGuidance ? <PositioningFirstStepNotice projectId={projectId} /> : null}
      {showOnboardingGuidance ? (
        <ProductionContextHeaderV3 projectName={project.name} stageId="positioning" completed={current ? ["positioning"] : []} />
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {!loading && loadError ? (
        <InlineActionErrorV1 message={loadError} />
      ) : null}

      {!loading && !loadError && !brief && (
        <p className="mb-4 rounded-[var(--acf-radius-sm)] bg-[var(--acf-surface-muted)] px-3 py-2 text-sm">
          建议先填写产品信息，这样定位会更贴合你的推广目标。
          <Link className="ml-2 underline" href={productInformationHref(projectId)}>
            去填写产品信息
          </Link>
          {briefUnavailable ? <span className="ml-2 text-[var(--acf-text-muted)]">产品信息暂时无法用于预填。</span> : null}
        </p>
      )}

      {!loading && !loadError && generateError ? (
        <div className="mb-4">
          <InlineActionErrorV1 message={generateError} onRetry={() => void generate()} />
        </div>
      ) : null}
      {!loading && !loadError && !generateError && failed && !current ? (
        <InlineActionErrorV1 message="账号定位没有生成，请稍后重试。" onRetry={() => openForm()} />
      ) : null}

      {!loading && !loadError && pending ? (
        <div className="mb-4">
          <AsyncTaskProgressV1
            status="RUNNING"
            label="AI 正在整理账号定位"
            stages={[{ id: "organize", label: "正在整理账号资料", state: "current" }]}
            canLeave
          />
        </div>
      ) : null}

      {!loading && !loadError && !current && !editing ? (
        <EmptyState
          title="还没有账号定位"
          description="告诉 AI 你的业务和目标，先完成账号定位。"
          primaryAction={{ label: "开始定位", onClick: () => openForm() }}
        />
      ) : null}

      {!loading && !loadError && editing ? (
        <PositioningForm
          form={form}
          errors={fieldErrors}
          pending={pending}
          reuseHint={reuseHint}
          onChange={(next) => {
            setForm(next);
            setDirty(true);
          }}
          onSubmit={() => void generate()}
          onCancel={() => {
            if (dirty && !window.confirm("有未保存的修改，确定离开吗？已保存的定位不会被清空。")) {
              return;
            }
            setEditing(false);
            setFieldErrors({});
            setDirty(false);
          }}
        />
      ) : null}

      {!loading && !loadError && current && !editing ? (
        <div className="space-y-6">
          {showConfirmedCta || confirmed ? (
            <div className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-4 py-3">
              <p className="text-sm font-medium">✓ 账号定位已确认</p>
              <p className="acf-caption mt-1">下一步：生成内容计划</p>
              <Link
                className="mt-3 inline-flex min-h-9 items-center rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-4 text-sm text-[var(--acf-text-inverse)]"
                href={contentPlansHref(projectId)}
              >
                继续到内容计划
              </Link>
              <span className="sr-only">生成内容计划</span>
            </div>
          ) : (
            <HumanReviewBar
              context="这条账号定位"
              confirmLabel="确认定位并继续"
              onConfirm={() => {
                setConfirmed(true);
                setNeedsReview(false);
              }}
              onRequestChanges={() => openForm(current)}
              onDefer={() => undefined}
            />
          )}
          <PositioningSummary
            output={current.output}
            input={current.input}
            platform={current.input?.platform || project.platform || undefined}
            specialLimits={brief?.constraints?.filter(Boolean).join("；") || undefined}
            onEdit={() => openForm(current)}
          />
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--acf-text-secondary)]"
            data-acf-positioning-secondary-actions
          >
            <button className="underline-offset-2 hover:underline" type="button" disabled={pending} onClick={() => openForm(current)}>
              修改定位
            </button>
            <details>
              <summary className="cursor-pointer">更多操作</summary>
              <div className="mt-1">
                <button className="underline-offset-2 hover:underline" type="button" disabled={pending} onClick={() => openForm(current)}>
                  重新生成定位
                </button>
              </div>
            </details>
          </div>
          <PositioningHistory items={history} />
        </div>
      ) : null}
      <div className="text-[var(--acf-text-muted)]" data-acf-positioning-flow-nav>
        <NextActionBarV1
          backHref={flow.back?.href}
          backLabel={flow.back?.label}
          currentLabel="账号定位"
          nextHref={flow.next?.href}
          nextLabel={flow.next?.label}
        />
      </div>
    </div>
  );
}
