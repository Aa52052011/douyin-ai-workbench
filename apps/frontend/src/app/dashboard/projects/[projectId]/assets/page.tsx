"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { EmptyState } from "../../../../../components/empty-state";
import { PageHeader } from "../../../../../components/page-header";
import { api, apiUpload } from "../../../../../lib/api";
import { useAuth } from "../../../../../lib/auth-context";
import {
  assetCardModel,
  libraryHasRawEnumVisible,
  libraryMimeFromFile,
  libraryTypeFromFile,
  LIBRARY_MAX_UPLOAD_BYTES,
  type AssetLibraryItem,
} from "../../../../../lib/asset-library";
import { useProjectWorkspace } from "../../../../../lib/project-workspace-context";

type FilterType = "" | "IMAGE" | "VIDEO" | "AUDIO" | "DIGITAL_HUMAN" | "REFERENCE";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export default function ProjectAssetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProjectWorkspace();
  const { accessToken } = useAuth();
  const [items, setItems] = useState<AssetLibraryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [asReference, setAsReference] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !projectId) return;
    const qs = new URLSearchParams({ projectId });
    if (filter && filter !== "REFERENCE") qs.set("type", filter);
    const rows = await api<AssetLibraryItem[]>(`/assets/library?${qs}`, { accessToken });
    setItems(rows);
  }, [accessToken, projectId, filter]);

  useEffect(() => {
    let cancelled = false;
    // Async project library fetch — mirrors other dashboard list pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional async load
    void load()
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const cards = useMemo(() => {
    const mapped = items.map(assetCardModel);
    if (filter === "REFERENCE") return mapped.filter((card) => card.referenceOnly);
    if (filter === "DIGITAL_HUMAN") return mapped;
    return mapped.filter((card) => !card.referenceOnly);
  }, [items, filter]);
  const pageText = cards.map((c) => `${c.filename}${c.sourceLabel}${c.rightsLabel}${c.reusableLabel}`).join(" ");

  async function onUpload(files: FileList | null) {
    const file = files?.[0];
    if (!accessToken || !projectId || !file) return;
    if (!asReference && !rightsConfirmed) {
      setError("请先确认拥有使用权，或勾选「仅作为参考素材」。");
      return;
    }
    if (file.size > LIBRARY_MAX_UPLOAD_BYTES) {
      setError("视频或文件超过 128MB 上限，请压缩后再上传。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const type = libraryTypeFromFile(file);
      const mimeType = libraryMimeFromFile(file);
      const inited = await api<AssetLibraryItem>("/assets", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          projectId,
          type,
          originalFilename: file.name,
          mimeType,
          size: file.size,
          referenceOnly: asReference,
          rightsConfirmed: !asReference && rightsConfirmed,
          libraryVisible: true,
        }),
      });
      await apiUpload(`/assets/${inited.id}/content`, file, accessToken);
      await api(`/assets/${inited.id}/complete`, { method: "POST", accessToken });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!accessToken) return;
    if (
      !window.confirm(
        "删除素材后，历史已完成视频不会受影响，但未来制作不会再使用该素材。确定删除吗？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/assets/${id}`, { method: "DELETE", accessToken });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法删除");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="素材中心"
        description="管理本项目可复用的图片、视频与音频。参考素材仅用于分析，不会直接进入成片。"
        breadcrumb={`项目 / ${project.name} / 素材中心`}
      />

      <section className="mb-4 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {([
            ["", "全部"],
            ["IMAGE", "图片"],
            ["VIDEO", "视频"],
            ["AUDIO", "声音"],
            ["DIGITAL_HUMAN", "数字人"],
            ["REFERENCE", "参考资料"],
          ] as const).map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              className={`rounded-md border px-3 py-1.5 text-sm ${
                filter === value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
              }`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            className="mt-1"
            checked={rightsConfirmed}
            disabled={asReference}
            onChange={(e) => setRightsConfirmed(e.target.checked)}
          />
          <span>确认你拥有该素材的使用权。</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-800">
          <input type="checkbox" className="mt-1" checked={asReference} onChange={(e) => setAsReference(e.target.checked)} />
          <span>仅作为参考素材（不直接进入成片）</span>
        </label>

        <label className="flex min-h-[5.5rem] cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-400 px-4 text-sm text-neutral-700">
          <input
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,video/mp4,audio/mpeg,audio/wav,audio/wave"
            disabled={busy}
            onChange={(e) => {
              void onUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {busy ? "上传中…" : "选择文件上传（图片 / 视频 / 音频）"}
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {libraryHasRawEnumVisible(pageText) ? (
          <p className="text-sm text-red-600" role="alert">
            检测到内部编码泄漏
          </p>
        ) : null}
      </section>

      {cards.length === 0 ? (
        <EmptyState
          title={filter === "DIGITAL_HUMAN" ? "还没有数字人素材" : filter === "REFERENCE" ? "还没有参考资料" : "还没有素材"}
          description={
            filter === "DIGITAL_HUMAN"
              ? "数字人生成服务尚未配置。当前仍可使用真实素材、AI 画面和系统声音制作。"
              : filter === "REFERENCE"
                ? "参考资料仅用于学习结构，不会直接放进成片。"
                : "上传素材，系统会优先使用真实画面。"
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const mime = items.find((i) => i.id === card.id)?.mimeType;
            return (
              <li key={card.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{card.filename}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {card.typeLabel} · {card.sourceLabel} · {card.sizeLabel}
                      {card.durationLabel ? ` · ${card.durationLabel}` : ""}
                      {card.resolutionLabel ? ` · ${card.resolutionLabel}` : ""}
                    </p>
                  </div>
                  {card.referenceOnly ? (
                    <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">参考素材</span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-neutral-600">
                  {card.reusableLabel} · {card.rightsLabel} · 使用 {card.usedCount} 次
                </p>
                {card.referenceOnly ? (
                  <p className="mt-1 text-xs text-neutral-500">仅用于分析，不直接进入成片。</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 text-xs"
                    onClick={() => setPreviewId(card.id === previewId ? null : card.id)}
                  >
                    {previewId === card.id ? "收起预览" : "预览"}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 text-xs text-red-700"
                    disabled={busy}
                    onClick={() => void remove(card.id)}
                  >
                    删除
                  </button>
                </div>
                {previewId === card.id ? (
                  <div className="mt-3 overflow-hidden rounded border bg-neutral-50 p-2">
                    <AssetPreview path={card.contentPath} accessToken={accessToken} mimeHint={mime} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AssetPreview({
  path,
  accessToken,
  mimeHint,
}: {
  path: string;
  accessToken: string | null;
  mimeHint?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "include",
        });
        if (!response.ok) throw new Error("preview failed");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, accessToken]);

  if (failed) return <p className="text-xs text-red-600">预览失败</p>;
  if (!url) return <p className="text-xs text-neutral-500">加载预览…</p>;
  if (mimeHint?.startsWith("image/")) {
    // Blob preview URL — next/image not applicable for auth-gated object URLs.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="max-h-48 w-full object-contain" />;
  }
  if (mimeHint?.startsWith("video/")) {
    return <video src={url} controls className="max-h-48 w-full" />;
  }
  if (mimeHint?.startsWith("audio/")) {
    return <audio src={url} controls className="w-full" />;
  }
  return (
    <a className="text-xs underline" href={url} target="_blank" rel="noreferrer">
      打开文件
    </a>
  );
}
