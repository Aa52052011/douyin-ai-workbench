"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../../components/empty-state";
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
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";

export default function ProductInformationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [current, setCurrent] = useState<ProductBriefRecord | null>(null);
  const [history, setHistory] = useState<ProductBriefRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProductBriefFormState>(emptyProductBriefForm());
  const [fieldErrors, setFieldErrors] = useState<ProductBriefFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

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
  }, [accessToken, projectId]);

  function startCreate() {
    setForm(
      emptyProductBriefForm({
        industry: project.industry ?? "",
        description: project.description ?? "",
      }),
    );
    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  }

  function startEdit() {
    if (!current) {
      return;
    }
    setForm(formFromPayload(current.payload));
    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  }

  function cancelEdit() {
    setForm(current ? formFromPayload(current.payload) : emptyProductBriefForm());
    setFieldErrors({});
    setSaveError(null);
    setEditing(false);
  }

  async function save() {
    if (!accessToken || !projectId) {
      return;
    }
    const errors = validateProductBriefForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setPending(true);
    setFieldErrors({});
    setSaveError(null);
    try {
      const created = await createProductBrief(accessToken, projectId, payloadFromForm(form));
      const briefs = await listProductBriefs(accessToken, projectId);
      setCurrent(created);
      setHistory(historyBriefs(briefs, created));
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setSaveError(humanizeProductBriefSaveError(err));
    } finally {
      setPending(false);
    }
  }

  const nextHref = positioningHref(projectId);

  return (
    <div>
      <PageHeader
        title="产品信息"
        description="告诉 AI 你要推广的产品、目标和核心卖点。这些信息会作为后续市场分析和推广策略的基础。"
        breadcrumb={`项目 / ${project.name} / 产品信息`}
      />

      {loading ? <p className="text-sm text-neutral-600">正在加载产品信息…</p> : null}
      {!loading && loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}

      {!loading && !loadError && saved ? (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          已保存。已生成新的产品信息版本。
        </p>
      ) : null}

      {!loading && !loadError && !current && !editing ? (
        <EmptyState
          title="还没有产品信息"
          description="先填写你要推广的产品，AI 才能为这个项目做市场分析和内容策略。"
          primaryAction={{ label: "填写产品信息", onClick: startCreate }}
        />
      ) : null}

      {!loading && !loadError && editing ? (
        <div>
          {saveError ? (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {saveError}
            </p>
          ) : null}
          <ProductBriefForm
            form={form}
            errors={fieldErrors}
            pending={pending}
            isNewVersion={Boolean(current)}
            onChange={setForm}
            onSubmit={() => void save()}
            onCancel={cancelEdit}
          />
        </div>
      ) : null}

      {!loading && !loadError && current && !editing ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={startEdit}>
              编辑产品信息
            </button>
            <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={nextHref}>
              下一步：生成账号定位
            </Link>
          </div>
          <p className="text-xs text-neutral-500">版本 {current.version}</p>
          <ProductBriefSummary payload={current.payload} />
          {accessToken ? <ProductBriefHistory items={history} accessToken={accessToken} /> : null}
        </div>
      ) : null}
    </div>
  );
}
