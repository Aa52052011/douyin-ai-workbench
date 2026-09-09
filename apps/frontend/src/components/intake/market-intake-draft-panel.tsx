import { useState } from "react";
import { StringListEditor } from "../string-list-editor";
import type {
  MarketCompetitorAccountDraft,
  MarketIntakeDraft,
  MarketIntakeReadiness,
  MarketLinkDraft,
} from "../../lib/market-intake.types";
import { MARKET_INTAKE_NO_DATA_HINT } from "../../lib/market-intake";

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

function LinkListEditor({
  id,
  label,
  items,
  disabled,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  items: MarketLinkDraft[];
  disabled?: boolean;
  onChange: (items: MarketLinkDraft[]) => void;
  hint?: string;
}) {
  const [url, setUrl] = useState("");
  const [labelText, setLabelText] = useState("");

  function add() {
    const nextUrl = url.trim();
    if (!nextUrl || disabled) return;
    if (items.some((item) => item.url === nextUrl)) {
      setUrl("");
      return;
    }
    onChange([...items, { url: nextUrl, ...(labelText.trim() ? { label: labelText.trim() } : {}) }]);
    setUrl("");
    setLabelText("");
  }

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {hint ? <p className="mb-1 text-xs text-neutral-500">{hint}</p> : null}
      <div className="flex min-w-0 flex-col gap-2">
        <input
          id={id}
          className={inputClass}
          value={url}
          disabled={disabled}
          placeholder="https://..."
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <input
          className={inputClass}
          value={labelText}
          disabled={disabled}
          placeholder="备注（可选）"
          aria-label={`${label}备注`}
          onChange={(event) => setLabelText(event.target.value)}
        />
        <button className="rounded-md border px-3 py-2 text-sm" type="button" disabled={disabled} onClick={add}>
          添加链接
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.url} className="flex min-w-0 items-start justify-between gap-2 break-all rounded-md bg-neutral-50 px-2 py-1.5 text-xs">
              <span className="min-w-0">
                {item.label ? <span className="font-medium">{item.label} · </span> : null}
                {item.url}
              </span>
              <button
                className="shrink-0 text-neutral-500"
                type="button"
                disabled={disabled}
                aria-label={`删除${label} ${item.url}`}
                onClick={() => onChange(items.filter((row) => row.url !== item.url))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CompetitorListEditor({
  items,
  disabled,
  onChange,
}: {
  items: MarketCompetitorAccountDraft[];
  disabled?: boolean;
  onChange: (items: MarketCompetitorAccountDraft[]) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [profileUrl, setProfileUrl] = useState("");

  function add() {
    const name = displayName.trim();
    if (!name || disabled) return;
    if (items.some((item) => item.displayName === name)) {
      setDisplayName("");
      return;
    }
    onChange([
      ...items,
      {
        displayName: name,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(profileUrl.trim() ? { profileUrl: profileUrl.trim() } : {}),
      },
    ]);
    setDisplayName("");
    setNote("");
    setProfileUrl("");
  }

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor="intake-competitorAccounts">
        竞品账号
      </label>
      <div className="flex min-w-0 flex-col gap-2">
        <input
          id="intake-competitorAccounts"
          className={inputClass}
          value={displayName}
          disabled={disabled}
          placeholder="账号名称"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <input
          className={inputClass}
          value={profileUrl}
          disabled={disabled}
          placeholder="主页链接（可选）"
          aria-label="竞品主页链接"
          onChange={(event) => setProfileUrl(event.target.value)}
        />
        <input
          className={inputClass}
          value={note}
          disabled={disabled}
          placeholder="备注（可选）"
          aria-label="竞品备注"
          onChange={(event) => setNote(event.target.value)}
        />
        <button className="rounded-md border px-3 py-2 text-sm" type="button" disabled={disabled} onClick={add}>
          添加竞品
        </button>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.displayName} className="flex min-w-0 items-start justify-between gap-2 break-words rounded-md bg-neutral-50 px-2 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{item.displayName}</span>
                {item.note ? <span className="text-neutral-600"> · {item.note}</span> : null}
                {item.profileUrl ? <span className="mt-0.5 block break-all text-neutral-500">{item.profileUrl}</span> : null}
              </span>
              <button
                className="shrink-0 text-neutral-500"
                type="button"
                disabled={disabled}
                aria-label={`删除竞品 ${item.displayName}`}
                onClick={() => onChange(items.filter((row) => row.displayName !== item.displayName))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MarketIntakeDraftPanel({
  draft,
  readiness,
  pending,
  onChangeDraft,
  onConfirm,
}: {
  draft: MarketIntakeDraft;
  readiness: MarketIntakeReadiness;
  pending?: boolean;
  onChangeDraft: (next: MarketIntakeDraft) => void;
  onConfirm: () => void;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">AI 已整理</h2>
        <p className="mt-0.5 text-xs text-neutral-500">当前调研草稿，确认前不会写入正式市场调研。</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <StringListEditor
          id="intake-keywords"
          label="关键词"
          items={draft.keywords}
          maxItems={40}
          maxItemLength={80}
          disabled={pending}
          onChange={(keywords) => onChangeDraft({ ...draft, keywords })}
        />
        <CompetitorListEditor
          items={draft.competitorAccounts}
          disabled={pending}
          onChange={(competitorAccounts) => onChangeDraft({ ...draft, competitorAccounts })}
        />
        <LinkListEditor
          id="intake-competitorVideos"
          label="竞品视频/公开内容"
          items={draft.competitorVideos}
          disabled={pending}
          hint="链接已记录，尚未自动抓取内容。"
          onChange={(competitorVideos) => onChangeDraft({ ...draft, competitorVideos })}
        />
        <LinkListEditor
          id="intake-publicLinks"
          label="公开链接"
          items={draft.publicLinks}
          disabled={pending}
          hint="链接已记录，尚未自动抓取内容。"
          onChange={(publicLinks) => onChangeDraft({ ...draft, publicLinks })}
        />
        <StringListEditor
          id="intake-userObservations"
          label="我的市场观察"
          items={draft.userObservations}
          maxItems={40}
          maxItemLength={500}
          disabled={pending}
          onChange={(userObservations) => onChangeDraft({ ...draft, userObservations })}
        />
        <StringListEditor
          id="intake-customerQuestions"
          label="客户常见问题"
          items={draft.customerQuestions}
          maxItems={40}
          maxItemLength={500}
          disabled={pending}
          onChange={(customerQuestions) => onChangeDraft({ ...draft, customerQuestions })}
        />
        <StringListEditor
          id="intake-commonPainPoints"
          label="常见痛点"
          items={draft.commonPainPoints}
          maxItems={40}
          maxItemLength={200}
          disabled={pending}
          onChange={(commonPainPoints) => onChangeDraft({ ...draft, commonPainPoints })}
        />
        <StringListEditor
          id="intake-commonSellingPoints"
          label="常见卖点"
          items={draft.commonSellingPoints}
          maxItems={40}
          maxItemLength={200}
          disabled={pending}
          onChange={(commonSellingPoints) => onChangeDraft({ ...draft, commonSellingPoints })}
        />
        <StringListEditor
          id="intake-marketHypotheses"
          label="市场假设"
          items={draft.marketHypotheses}
          maxItems={20}
          maxItemLength={500}
          disabled={pending}
          onChange={(marketHypotheses) => onChangeDraft({ ...draft, marketHypotheses })}
        />
      </div>

      <div className="space-y-2 border-t border-neutral-200 px-4 py-3">
        {readiness.hint ? (
          <p className="text-sm text-neutral-600" id="market-intake-missing-hint">
            {readiness.hint}
          </p>
        ) : null}
        {!readiness.hasResearchMaterial && readiness.userAcknowledgedLimitedData ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">{MARKET_INTAKE_NO_DATA_HINT}</p>
        ) : null}
        <button
          className="w-full rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
          type="button"
          disabled={pending || !readiness.readyForConfirmation}
          aria-describedby={!readiness.readyForConfirmation ? "market-intake-missing-hint" : undefined}
          onClick={onConfirm}
        >
          确认并开始市场分析
        </button>
      </div>
    </aside>
  );
}
