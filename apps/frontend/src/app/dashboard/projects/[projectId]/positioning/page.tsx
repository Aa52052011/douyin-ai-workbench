"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../../components/empty-state";
import { PageHeader } from "../../../../../components/page-header";
import { PositioningForm } from "../../../../../components/positioning-form";
import { PositioningHistory } from "../../../../../components/positioning-history";
import { PositioningSummary } from "../../../../../components/positioning-summary";
import { ProductionContextHeaderV3, WorkflowFooterV3 } from "../../../../../components/production-context-header";
import { AITaskState } from "../../../../../components/ui/ai-task-state";
import { ProductErrorState } from "../../../../../components/ui/error-state";
import { HumanReviewBar } from "../../../../../components/ui/human-review-bar";
import { useToast } from "../../../../../components/ui/toast";
import { Button } from "../../../../../components/ui/button";
import { useAuth } from "../../../../../lib/auth-context";
import { getCurrentProductBrief } from "../../../../../lib/product-brief.api";
import type { ProductBriefPayload } from "../../../../../lib/product-brief.types";
import { executePositioning, listPositioningRuns, waitForPositioningRun } from "../../../../../lib/positioning.api";
import {
  currentPositioningRecord,
  historyPositioningRecords,
  humanizePositioningError,
  inputFromForm,
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
  const toast = useToast();

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
      const started = await executePositioning(accessToken, projectId, onlyContractInput(inputFromForm(form)));
      const finished = await waitForPositioningRun(accessToken, started);
      const latest = await listPositioningRuns(accessToken, projectId);
      setRuns(latest);
      setEditing(false);
      setDirty(false);
      setConfirmed(false);
      if (finished.status === "FAILED") {
        setGenerateError("账号定位生成失败，请稍后重试。");
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
      <PageHeader
        title="账号定位"
        description="用几句话告诉系统：你是谁、做什么、给谁看。"
        breadcrumb={[
          { label: "项目", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${projectId}` },
          { label: "账号定位" },
        ]}
      />
      <ProductionContextHeaderV3 projectName={project.name} stageId="positioning" completed={current ? ["positioning"] : []} />

      {loading ? <p className="text-sm text-neutral-600">正在加载账号定位…</p> : null}
      {!loading && loadError ? (
        <ProductErrorState title="没能加载账号定位" humanMessage={loadError} recoveryAction="刷新后重试" />
      ) : null}

      {!loading && !loadError && !brief && (
        <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          建议先填写产品信息，这样定位会更贴合你的推广目标。
          <Link className="ml-2 underline" href={productInformationHref(projectId)}>
            去填写产品信息
          </Link>
          {briefUnavailable ? <span className="ml-2 text-neutral-500">产品信息暂时无法用于预填。</span> : null}
        </p>
      )}

      {!loading && !loadError && generateError ? (
        <div className="mb-4">
          <ProductErrorState title="账号定位没有生成" humanMessage={generateError} recoveryAction="稍后重试" />
        </div>
      ) : null}
      {!loading && !loadError && !generateError && failed && !current ? (
        <ProductErrorState title="账号定位没有生成" humanMessage="请稍后重试。" recoveryAction="重新生成" />
      ) : null}

      {!loading && !loadError && pending ? (
        <div className="mb-4">
          <AITaskState state="RUNNING" stages={["正在整理账号资料", "正在生成定位"]} />
        </div>
      ) : null}

      {!loading && !loadError && !current && !editing ? (
        <EmptyState
          title="还没有账号定位"
          description="先确定账号的人设、目标受众和内容方向，后续内容计划都会以此为基础。"
          primaryAction={{ label: "生成账号定位", onClick: () => openForm() }}
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
          {confirmed ? (
            <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
              <p className="text-sm font-medium">账号定位已完成</p>
              <p className="mt-1 text-sm text-neutral-600">下一步：生成内容计划</p>
              <Link className="mt-3 inline-flex rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={contentPlansHref(projectId)}>
                生成内容计划
              </Link>
            </div>
          ) : (
            <HumanReviewBar
              context="这条账号定位"
              confirmLabel="确认定位并继续"
              onConfirm={() => setConfirmed(true)}
              onRequestChanges={() => openForm(current)}
              onDefer={() => undefined}
            />
          )}
          <PositioningSummary output={current.output} platform={current.input?.platform || project.platform || undefined} onEdit={() => openForm(current)} />
          <details className="text-sm text-neutral-600">
            <summary className="cursor-pointer">更多操作</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" type="button" disabled={pending} onClick={() => openForm(current)}>
                重新生成定位
              </Button>
            </div>
          </details>
          <PositioningHistory items={history} />
        </div>
      ) : null}
      <WorkflowFooterV3 projectId={projectId} stageId="positioning" />
    </div>
  );
}
