"use client";

import { useRef, useState } from "react";
import { api, apiUpload } from "../../lib/api";
import { requestAutonomousResearch } from "../../lib/research.api";
import type { MarketIntakeDraft } from "../../lib/market-intake.types";
import {
  classifyMarketUrl,
  createSourceId,
  marketSourceRoleLabel,
  marketSourceTypeLabel,
  upsertMarketSource,
  type MarketSourceDraftEntry,
  type MarketSourceRole,
  type MarketSourceType,
} from "../../lib/market-source";

type Mode = "url" | "keyword" | "competitor" | "text" | "video" | "screenshot" | "sheet" | null;

const ROLE_OPTIONS: Array<{ role: MarketSourceRole; hint?: string }> = [
  { role: "MARKET_EVIDENCE" },
  { role: "REFERENCE_CONTENT", hint: "用于学习内容结构，不直接复制或使用原视频素材。" },
  { role: "OWN_CONTENT", hint: "可用于学习你的账号风格与历史表现。" },
  { role: "PRODUCTION_ASSET", hint: "将直接加入素材库，不记为市场数据。" },
];

function sourceCardTitle(entry: MarketSourceDraftEntry): string {
  if (entry.keyword) return `🔎 关键词：${entry.keyword}`;
  if (entry.competitorName) return `🏪 竞品：${entry.competitorName}`;
  if (entry.role === "REFERENCE_CONTENT") return `⭐ ${marketSourceTypeLabel(entry.sourceType)}`;
  if (entry.role === "OWN_CONTENT") return `👤 ${marketSourceTypeLabel(entry.sourceType)}`;
  if (entry.sourceType === "UPLOAD_SCREENSHOT") return `📷 ${marketSourceTypeLabel(entry.sourceType)}`;
  if (entry.sourceType.startsWith("DOUYIN") || entry.sourceType === "WEB_URL") {
    return `🔗 ${marketSourceTypeLabel(entry.sourceType)}`;
  }
  return marketSourceTypeLabel(entry.sourceType);
}

export function MarketSourceIntakePanel({
  projectId,
  accessToken,
  draft,
  pending,
  onChangeDraft,
}: {
  projectId: string;
  accessToken: string;
  draft: MarketIntakeDraft;
  pending?: boolean;
  onChangeDraft: (next: MarketIntakeDraft) => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [role, setRole] = useState<MarketSourceRole>("MARKET_EVIDENCE");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setValue("");
    setNote("");
    setMode(null);
  }

  function addEntry(entry: MarketSourceDraftEntry): boolean {
    const result = upsertMarketSource(draft.sources, entry);
    if (!result.created) {
      setMessage("已存在相同资料，未重复添加。");
      return false;
    }
    let next: MarketIntakeDraft = { ...draft, sources: result.list };
    if (entry.role === "MARKET_EVIDENCE" && entry.sourceType === "KEYWORD" && entry.keyword) {
      if (!next.keywords.includes(entry.keyword)) {
        next = { ...next, keywords: [...next.keywords, entry.keyword] };
      }
    }
    if (entry.role === "MARKET_EVIDENCE" && entry.sourceType === "COMPETITOR_NAME" && entry.competitorName) {
      if (!next.competitorAccounts.some((c) => c.displayName === entry.competitorName)) {
        next = {
          ...next,
          competitorAccounts: [
            ...next.competitorAccounts,
            { displayName: entry.competitorName, ...(entry.url ? { profileUrl: entry.url } : {}) },
          ],
        };
      }
    }
    onChangeDraft(next);
    setMessage("已添加。");
    return true;
  }

  function submitTextual() {
    if (pending || busy) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();

    if (mode === "url") {
      const classified = classifyMarketUrl(trimmed);
      if (!classified.valid || !classified.canonicalUrl) {
        setMessage("链接无效，请检查后重试。");
        return;
      }
      if (role === "PRODUCTION_ASSET") {
        setMessage("制作素材请上传文件，链接不会进入市场调研。");
        return;
      }
      addEntry({
        id: createSourceId(),
        role,
        sourceType: classified.sourceType,
        platform: classified.platform,
        url: classified.canonicalUrl,
        canonicalUrl: classified.canonicalUrl,
        userNote: note.trim() || undefined,
        reasonForReference: role === "REFERENCE_CONTENT" ? note.trim() || undefined : undefined,
        provenance: "USER_PROVIDED",
        capturedAt: now,
      });
      resetForm();
      return;
    }

    if (mode === "keyword") {
      if (role === "PRODUCTION_ASSET") {
        setMessage("关键词不能作为制作素材。");
        return;
      }
      addEntry({
        id: createSourceId(),
        role: role === "OWN_CONTENT" ? "OWN_CONTENT" : role === "REFERENCE_CONTENT" ? "REFERENCE_CONTENT" : "MARKET_EVIDENCE",
        sourceType: "KEYWORD",
        keyword: trimmed.slice(0, 80),
        label: trimmed.slice(0, 80),
        provenance: "USER_PROVIDED",
        capturedAt: now,
      });
      resetForm();
      return;
    }

    if (mode === "competitor") {
      addEntry({
        id: createSourceId(),
        role: "MARKET_EVIDENCE",
        sourceType: "COMPETITOR_NAME",
        competitorName: trimmed.slice(0, 80),
        label: trimmed.slice(0, 80),
        userNote: note.trim() || undefined,
        provenance: "USER_PROVIDED",
        capturedAt: now,
      });
      resetForm();
      return;
    }

    if (mode === "text") {
      addEntry({
        id: createSourceId(),
        role: role === "PRODUCTION_ASSET" ? "MARKET_EVIDENCE" : role,
        sourceType: "MANUAL_TEXT",
        text: trimmed.slice(0, 500),
        label: trimmed.slice(0, 40),
        provenance: "MANUAL",
        capturedAt: now,
      });
      resetForm();
    }
  }

  async function onUpload(files: FileList | null, kind: "video" | "screenshot" | "sheet") {
    const file = files?.[0];
    if (!file || !accessToken || pending) return;
    setBusy(true);
    setMessage(null);
    setHandoffNote(null);
    try {
      const isProduction = role === "PRODUCTION_ASSET";
      const referenceOnly = !isProduction;
      const rightsConfirmed = isProduction;

      const type =
        kind === "sheet"
          ? "DOCUMENT"
          : file.type.startsWith("video/")
            ? "VIDEO"
            : file.type.startsWith("image/")
              ? "IMAGE"
              : "OTHER";

      const inited = await api<{ id: string }>("/assets", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          projectId,
          type,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          referenceOnly,
          rightsConfirmed,
          libraryVisible: true,
        }),
      });
      await apiUpload(`/assets/${inited.id}/content`, file, accessToken);
      await api(`/assets/${inited.id}/complete`, { method: "POST", accessToken });

      if (isProduction) {
        setHandoffNote("已加入素材库");
        setMessage("已加入素材库（不记为市场数据）。");
        resetForm();
        return;
      }

      let sourceType: MarketSourceType =
        kind === "screenshot" ? "UPLOAD_SCREENSHOT" : kind === "sheet" ? "SPREADSHEET" : "UPLOAD_VIDEO";
      if (kind === "video" && file.type.startsWith("image/")) sourceType = "UPLOAD_IMAGE";

      addEntry({
        id: createSourceId(),
        role,
        sourceType,
        assetId: inited.id,
        title: file.name,
        label: file.name,
        userNote: note.trim() || undefined,
        reasonForReference: role === "REFERENCE_CONTENT" ? note.trim() || undefined : undefined,
        provenance: "UPLOADED",
        capturedAt: new Date().toISOString(),
      });
      resetForm();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function requestSystemResearch() {
    onChangeDraft({ ...draft, researchRequested: true });
    setBusy(true);
    try {
      const view = await requestAutonomousResearch(accessToken, projectId);
      setResearchStatus(view.statusLabel);
      setMessage(view.limitationSummary);
    } catch {
      setResearchStatus("自动市场研究服务尚未配置");
      setMessage("自动市场研究服务尚未配置，当前会继续使用你提供的信息。");
    } finally {
      setBusy(false);
    }
  }

  function removeSource(id: string) {
    onChangeDraft({ ...draft, sources: draft.sources.filter((s) => s.id !== id) });
  }

  function changeRole(id: string, nextRole: MarketSourceRole) {
    if (nextRole === "PRODUCTION_ASSET") {
      setMessage("制作素材请通过上传入口加入素材库。");
      return;
    }
    onChangeDraft({
      ...draft,
      sources: draft.sources.map((s) => (s.id === id ? { ...s, role: nextRole } : s)),
    });
  }

  const roleHint = ROLE_OPTIONS.find((item) => item.role === role)?.hint;

  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3" data-acf-market-sources>
      <div>
        <h3 className="text-sm font-medium">添加市场/参考资料</h3>
        <p className="mt-0.5 text-xs text-neutral-500">链接与上传会按你选择的用途分类；不会自动抓取抖音。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["url", "粘贴链接"],
            ["keyword", "输入关键词"],
            ["competitor", "输入竞品"],
            ["video", "上传视频"],
            ["screenshot", "上传截图"],
            ["sheet", "上传表格"],
            ["text", "输入文字"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`rounded-md border px-2.5 py-1.5 text-xs ${mode === key ? "border-neutral-900 bg-white" : "bg-white"}`}
            disabled={pending || busy}
            onClick={() => {
              setMode(key);
              setMessage(null);
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-md border border-dashed px-2.5 py-1.5 text-xs"
          disabled={pending || busy}
          onClick={requestSystemResearch}
        >
          让系统自己研究
        </button>
      </div>

      {draft.researchRequested ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950 break-words min-w-0">
          {researchStatus ?? "自动市场研究服务尚未配置，当前会继续使用你提供的信息。"}
        </p>
      ) : null}

      {mode ? (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-3">
          <p className="text-xs font-medium">这份资料是：</p>
          <div className="flex flex-col gap-1.5">
            {ROLE_OPTIONS.map((opt) => (
              <label key={opt.role} className="flex items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="market-source-role"
                  checked={role === opt.role}
                  disabled={pending || busy || (mode === "competitor" && opt.role !== "MARKET_EVIDENCE")}
                  onChange={() => setRole(opt.role)}
                />
                <span>{marketSourceRoleLabel(opt.role)}</span>
              </label>
            ))}
          </div>
          {roleHint ? <p className="text-xs text-neutral-600">{roleHint}</p> : null}

          {mode === "url" || mode === "keyword" || mode === "competitor" || mode === "text" ? (
            <>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={value}
                disabled={pending || busy}
                placeholder={
                  mode === "url"
                    ? "https://..."
                    : mode === "keyword"
                      ? "例如：美甲获客"
                      : mode === "competitor"
                        ? "竞品名称"
                        : "市场观察或行业资料"
                }
                onChange={(e) => setValue(e.target.value)}
              />
              {mode === "url" || mode === "competitor" || mode === "text" ? (
                <input
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  value={note}
                  disabled={pending || busy}
                  placeholder="备注（可选）"
                  onChange={(e) => setNote(e.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="rounded-md bg-neutral-950 px-3 py-1.5 text-xs text-white"
                disabled={pending || busy || !value.trim()}
                onClick={submitTextual}
              >
                添加
              </button>
            </>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                className="block w-full text-xs"
                disabled={pending || busy}
                accept={
                  mode === "video"
                    ? "video/*,image/*"
                    : mode === "screenshot"
                      ? "image/*"
                      : ".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                }
                onChange={(e) => void onUpload(e.target.files, mode === "screenshot" ? "screenshot" : mode === "sheet" ? "sheet" : "video")}
              />
              {isReferenceLike(role) ? (
                <p className="text-xs text-neutral-500">上传后将作为参考/研究资料保存，不会直接进入成片。</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {message ? (
        <p className="text-xs text-neutral-700" role="status">
          {message}
        </p>
      ) : null}
      {handoffNote ? (
        <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900" role="status">
          {handoffNote}
        </p>
      ) : null}

      <div>
        <h4 className="mb-1 text-xs font-medium text-neutral-700">已添加资料</h4>
        {draft.sources.length === 0 ? (
          <p className="text-xs text-neutral-500">还没有结构化资料。也可以使用下方旧字段或「暂时没有市场资料」。</p>
        ) : (
          <ul className="space-y-1.5">
            {draft.sources.map((entry) => (
              <li
                key={entry.id}
                className="flex min-w-0 items-start justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium">{sourceCardTitle(entry)}</p>
                  <p className="text-neutral-500">{marketSourceRoleLabel(entry.role)}</p>
                  {entry.role === "REFERENCE_CONTENT" ? (
                    <p className="mt-0.5 text-neutral-500">用于学习内容结构，不直接复制或使用原视频素材。</p>
                  ) : null}
                  {entry.role === "OWN_CONTENT" ? (
                    <p className="mt-0.5 text-neutral-500">可用于学习你的账号风格与历史表现。</p>
                  ) : null}
                  {entry.canonicalUrl || entry.url ? (
                    <p className="mt-0.5 break-all text-neutral-500">{entry.canonicalUrl || entry.url}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <select
                    className="max-w-[9rem] rounded border border-neutral-200 bg-white px-1 py-0.5 text-[11px]"
                    value={entry.role}
                    disabled={pending || busy}
                    aria-label="资料用途"
                    onChange={(e) => changeRole(entry.id, e.target.value as MarketSourceRole)}
                  >
                    <option value="MARKET_EVIDENCE">{marketSourceRoleLabel("MARKET_EVIDENCE")}</option>
                    <option value="REFERENCE_CONTENT">{marketSourceRoleLabel("REFERENCE_CONTENT")}</option>
                    <option value="OWN_CONTENT">{marketSourceRoleLabel("OWN_CONTENT")}</option>
                  </select>
                  <button
                    type="button"
                    className="text-neutral-500"
                    disabled={pending || busy}
                    aria-label="删除资料"
                    onClick={() => removeSource(entry.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function isReferenceLike(role: MarketSourceRole): boolean {
  return role === "REFERENCE_CONTENT" || role === "MARKET_EVIDENCE" || role === "OWN_CONTENT";
}
