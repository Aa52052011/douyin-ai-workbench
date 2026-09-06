"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../../components/empty-state";
import { PageHeader } from "../../../../../components/page-header";
import { PositioningForm } from "../../../../../components/positioning-form";
import { PositioningHistory } from "../../../../../components/positioning-history";
import { PositioningSummary } from "../../../../../components/positioning-summary";
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
  marketResearchHref,
  onlyContractInput,
  productInformationHref,
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
      if (finished.status === "FAILED") {
        setGenerateError("账号定位生成失败，请稍后重试。");
      }
    } catch (err) {
      setGenerateError(humanizePositioningError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="账号定位"
        description="明确你的账号要面向谁、以什么身份表达、长期围绕哪些内容方向创作。"
        breadcrumb={`项目 / ${project.name} / 账号定位`}
      />

      {loading ? <p className="text-sm text-neutral-600">正在加载账号定位…</p> : null}
      {!loading && loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

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
        <p className="mb-4 text-sm text-red-600" role="alert">
          {generateError}
        </p>
      ) : null}
      {!loading && !loadError && !generateError && failed && !current ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          账号定位生成失败，请稍后重试。
        </p>
      ) : null}

      {!loading && !loadError && pending ? (
        <p className="mb-4 text-sm text-neutral-700" aria-live="polite">
          AI 正在生成账号定位…
        </p>
      ) : null}

      {!loading && !loadError && !current && !editing ? (
        <EmptyState
          title="还没有账号定位"
          description="先确定账号的人设、目标受众和内容方向，后续推广策略和内容计划都会以此为基础。"
          primaryAction={{ label: "生成账号定位", onClick: () => openForm() }}
        />
      ) : null}

      {!loading && !loadError && editing ? (
        <PositioningForm
          form={form}
          errors={fieldErrors}
          pending={pending}
          onChange={setForm}
          onSubmit={() => void generate()}
          onCancel={() => {
            setEditing(false);
            setFieldErrors({});
          }}
        />
      ) : null}

      {!loading && !loadError && current && !editing ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={marketResearchHref(projectId)}>
              下一步：导入市场数据
            </Link>
            <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending} onClick={() => openForm(current)}>
              重新生成定位
            </button>
          </div>
          <p className="text-xs text-neutral-500">最新结果</p>
          <PositioningSummary output={current.output} />
          <PositioningHistory items={history} />
        </div>
      ) : null}
    </div>
  );
}
