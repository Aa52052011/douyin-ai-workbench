"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../../../../components/empty-state";
import { MarketImportWizard } from "../../../../../../components/market-import-wizard";
import { MarketResearchHistory } from "../../../../../../components/market-research-history";
import { PageHeader } from "../../../../../../components/page-header";
import { useAuth } from "../../../../../../lib/auth-context";
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

export default function MarketResearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [brief, setBrief] = useState<ProductBriefRecord | null>(null);
  const [items, setItems] = useState<MarketResearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);

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
        setItems(sortResearchNewestFirst(listResult.value));
        setBrief(briefResult.status === "fulfilled" ? briefResult.value : null);
        setLoadError(null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  async function refreshList() {
    if (!accessToken || !projectId) {
      return;
    }
    const rows = await listMarketResearch(accessToken, projectId);
    setItems(sortResearchNewestFirst(rows));
  }

  const canImport = Boolean(brief);

  return (
    <div>
      <PageHeader
        title="市场调研"
        description="导入作品、关键词、竞品等市场样本，为后续市场分析和推广策略提供依据。"
        breadcrumb={`项目 / ${project.name} / 市场调研`}
        actions={
          !loading && canImport ? (
            <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setImporting(true)}>
              导入市场数据
            </button>
          ) : null
        }
      />

      {loading ? <p className="text-sm text-neutral-600">正在加载市场调研…</p> : null}
      {!loading && loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && !brief ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p>建议先填写产品信息，再开始市场调研。</p>
          <Link className="mt-2 inline-block underline" href={productInformationHref(projectId)}>
            去填写产品信息
          </Link>
        </div>
      ) : null}

      {!loading && !loadError && brief ? (
        <p className="mb-6 text-sm text-neutral-600">
          当前产品：{brief.payload.productName}
          {brief.payload.industry ? ` · ${brief.payload.industry}` : ""}
        </p>
      ) : null}

      {!loading && !loadError && success ? (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          市场数据已导入，可以开始市场分析。
        </p>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <EmptyState
          title="还没有市场调研数据"
          description="导入一批作品、关键词、竞品或趋势数据，AI 才能基于真实样本做市场分析。"
          primaryAction={
            canImport
              ? { label: "导入市场数据", onClick: () => setImporting(true) }
              : { label: "去填写产品信息", href: productInformationHref(projectId) }
          }
        />
      ) : null}

      {!loading && !loadError && items.length > 0 ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={marketAnalysisHref(projectId)}>
              下一步：开始市场分析
            </Link>
          </div>
          <p className="text-sm text-neutral-600">当前导入数据仅代表你提供的样本，不代表平台整体。导入更多行也不一定会变成“可用于分析”。</p>
          <MarketResearchHistory items={items} />
        </div>
      ) : null}

      {importing && accessToken && canImport ? (
        <MarketImportWizard
          projectId={projectId}
          accessToken={accessToken}
          productBriefId={brief?.id}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            setSuccess(true);
            void refreshList();
          }}
        />
      ) : null}
    </div>
  );
}
