"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { confirmMarketImport, previewMarketImport } from "../lib/market-research.api";
import {
  cellText,
  collectedAtToIso,
  confirmSemantics,
  confidenceLabel,
  duplicateMappedFields,
  fieldLabel,
  humanizeMarketImportError,
  mappingForPreview,
  mappingOptions,
  missingRequiredFields,
  nextIdempotencyKey,
  qualityLabel,
  uniqueWarningLabels,
  validateImportFile,
} from "../lib/market-research.form";
import {
  KIND_LABELS,
  MARKET_IMPORT_KINDS,
  MARKET_IMPORT_MAPPING_VERSION,
  ORIGIN_OPTIONS,
  SELECTION_OPTIONS,
  type MarketImportKind,
  type MarketImportPreview,
} from "../lib/market-research.types";

type Step = 1 | 2 | 3 | 4;

export function MarketImportWizard({
  projectId,
  accessToken,
  productBriefId,
  onClose,
  onImported,
}: {
  projectId: string;
  accessToken: string;
  productBriefId?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<MarketImportKind>("CONTENT");
  const [file, setFile] = useState<File | null>(null);
  const [origin, setOrigin] = useState("UNKNOWN");
  const [selectionMethod, setSelectionMethod] = useState("UNKNOWN");
  const [collectedAt, setCollectedAt] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MarketImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotency, setIdempotency] = useState<{ semantics: string; key: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const options = useMemo(() => mappingOptions(kind), [kind]);
  const missing = missingRequiredFields(kind, mapping);
  const duplicates = duplicateMappedFields(mapping);
  const fileError = validateImportFile(file);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function exampleFor(column: string): string {
    const row = preview?.rows[0];
    return row ? cellText(row.cells[column]) : "";
  }

  async function runPreview(withMapping: boolean) {
    if (!file) {
      setError("请选择 CSV 或 XLSX 文件");
      return;
    }
    if (fileError) {
      setError(fileError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await previewMarketImport(accessToken, projectId, {
        file,
        kind,
        productBriefId,
        mapping: withMapping ? mappingForPreview(mapping) : null,
        collectedAtOverride: collectedAtToIso(collectedAt),
        origin,
        selectionMethod,
      });
      setPreview(result);
      const nextMapping: Record<string, string> = {};
      for (const column of result.detectedColumns) {
        nextMapping[column] = result.resolvedMapping[column] ?? "";
      }
      setMapping(nextMapping);
      setStep(withMapping ? 4 : 3);
    } catch (err) {
      setError(humanizeMarketImportError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!file || !preview) {
      return;
    }
    if (missing.length > 0 || duplicates.length > 0 || preview.summary.validRows < 1) {
      setError("请检查字段匹配后重试。");
      return;
    }
    const resolvedMapping = mappingForPreview(mapping);
    if (!resolvedMapping) {
      setError("请检查字段匹配后重试。");
      return;
    }
    const semantics = confirmSemantics({
      kind,
      fileName: file.name,
      fileSize: file.size,
      mapping: resolvedMapping,
      origin,
      selectionMethod,
      collectedAt,
    });
    const next = nextIdempotencyKey(idempotency, semantics);
    setIdempotency(next);
    setBusy(true);
    setError(null);
    try {
      await confirmMarketImport(accessToken, projectId, {
        idempotencyKey: next.key,
        kind,
        productBriefId: preview.productBriefId ?? productBriefId,
        collectedAt: collectedAtToIso(collectedAt),
        mappingVersion: preview.mappingVersion || MARKET_IMPORT_MAPPING_VERSION,
        fileFingerprint: preview.fileFingerprint,
        normalizedItemsFingerprint: preview.normalizedItemsFingerprint,
        format: preview.format,
        resolvedMapping,
        origin,
        selectionMethod,
        rows: preview.rows.map((row) => ({ rowNumber: row.rowNumber, cells: row.cells })),
      });
      onImported();
    } catch (err) {
      setError(humanizeMarketImportError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">导入市场数据</h2>
            <p className="mt-1 text-sm text-neutral-600">一次导入一种数据类型。作品和关键词请分两次导入。</p>
            <p className="mt-1 text-xs text-neutral-500">步骤 {step} / 4</p>
          </div>
          <button
            ref={closeRef}
            className="shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {error ? (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">选择数据类型</legend>
            <div className="space-y-2">
              {MARKET_IMPORT_KINDS.map((item) => (
                <label key={item} className="flex cursor-pointer gap-3 rounded-lg border border-neutral-200 p-3">
                  <input
                    type="radio"
                    name="kind"
                    value={item}
                    checked={kind === item}
                    disabled={busy}
                    onChange={() => {
                      setKind(item);
                      setPreview(null);
                      setMapping({});
                      setIdempotency(null);
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">{KIND_LABELS[item].label}</span>
                    <span className="block text-sm text-neutral-600">{KIND_LABELS[item].description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" type="button" onClick={() => setStep(2)}>
                下一步
              </button>
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="market-file">
                上传文件
              </label>
              <label
                htmlFor="market-file"
                className="block cursor-pointer rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-600"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const next = event.dataTransfer.files[0] ?? null;
                  setFile(next);
                  setPreview(null);
                  setIdempotency(null);
                }}
              >
                拖拽 CSV / XLSX 到这里，或点击选择文件
              </label>
              <input
                id="market-file"
                className="sr-only"
                type="file"
                accept=".csv,.xlsx"
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  setPreview(null);
                  setIdempotency(null);
                }}
              />
              <p className="mt-1 text-xs text-neutral-500">支持 CSV / XLSX，文件大小 ≤ 1MB，最多 200 行。</p>
              {file ? (
                <p className="mt-2 text-sm text-neutral-700">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">数据来源</span>
                <select className="w-full rounded-md border px-3 py-2" value={origin} disabled={busy} onChange={(event) => setOrigin(event.target.value)}>
                  {ORIGIN_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">样本选择方式</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={selectionMethod}
                  disabled={busy}
                  onChange={(event) => setSelectionMethod(event.target.value)}
                >
                  {SELECTION_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">采集时间（可选）</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                type="datetime-local"
                value={collectedAt}
                disabled={busy}
                onChange={(event) => setCollectedAt(event.target.value)}
              />
            </label>
            <div className="flex justify-between">
              <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={busy} onClick={() => setStep(1)}>
                上一步
              </button>
              <button
                className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white"
                type="button"
                disabled={busy || Boolean(fileError)}
                onClick={() => void runPreview(false)}
              >
                {busy ? "解析中…" : "解析并匹配字段"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && preview ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">已根据常见列名自动匹配，可再调整。</p>
            <div className="hidden max-w-full overflow-x-auto md:block">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="text-neutral-500">
                    <th className="py-2 font-medium">文件列</th>
                    <th className="py-2 font-medium">示例数据</th>
                    <th className="py-2 font-medium">对应字段</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.detectedColumns.map((column) => (
                    <tr key={column} className="border-t border-neutral-100">
                      <td className="py-2 align-top">{column || "（空列名）"}</td>
                      <td className="max-w-[12rem] truncate py-2 align-top text-neutral-600">{exampleFor(column)}</td>
                      <td className="py-2">
                        <select
                          className="w-full rounded-md border px-2 py-1"
                          aria-label={`${column} 对应字段`}
                          value={mapping[column] ?? ""}
                          disabled={busy}
                          onChange={(event) => setMapping({ ...mapping, [column]: event.target.value })}
                        >
                          <option value="">不导入此列</option>
                          {options.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {preview.detectedColumns.map((column) => (
                <div key={column} className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-sm font-medium">{column || "（空列名）"}</p>
                  <p className="mt-1 break-all text-xs text-neutral-500">示例：{exampleFor(column) || "无"}</p>
                  <label className="mt-2 block text-sm">
                    对应字段
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1"
                      value={mapping[column] ?? ""}
                      disabled={busy}
                      onChange={(event) => setMapping({ ...mapping, [column]: event.target.value })}
                    >
                      <option value="">不导入此列</option>
                      {options.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            {missing.length > 0 ? (
              <p className="text-sm text-red-600">还需要匹配：{missing.map(fieldLabel).join("、")}</p>
            ) : null}
            {duplicates.length > 0 ? (
              <p className="text-sm text-red-600">这些字段被匹配了多次：{duplicates.map(fieldLabel).join("、")}</p>
            ) : null}
            <div className="flex justify-between">
              <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={busy} onClick={() => setStep(2)}>
                上一步
              </button>
              <button
                className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white"
                type="button"
                disabled={busy || missing.length > 0 || duplicates.length > 0}
                onClick={() => void runPreview(true)}
              >
                {busy ? "预览中…" : "查看导入预览"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 && preview ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-neutral-200 p-3 text-sm">
              <p>可导入 {preview.summary.validRows} 条</p>
              <p>重复 {preview.summary.duplicateRows} 条</p>
              <p>有问题 {preview.summary.invalidRows} 条</p>
              {preview.collectedAtAssumed ? <p>{uniqueWarningLabels(["COLLECTED_AT_ASSUMED"])[0]}</p> : null}
              {qualityLabel(preview.dataQualityPreview?.dataSufficiency) ? (
                <p>
                  {qualityLabel(preview.dataQualityPreview?.dataSufficiency)}
                  {confidenceLabel(preview.dataQualityPreview?.confidence)
                    ? ` · ${confidenceLabel(preview.dataQualityPreview?.confidence)}`
                    : ""}
                </p>
              ) : null}
              <p className="mt-2 text-neutral-600">当前导入数据仅代表你提供的样本，不代表平台整体。</p>
            </section>
            {uniqueWarningLabels(preview.warnings).length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {uniqueWarningLabels(preview.warnings).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <div>
              <h3 className="mb-2 text-sm font-medium">标准化预览（前 3 行）</h3>
              <ul className="space-y-2 text-sm">
                {preview.rows.slice(0, 3).map((row) => (
                  <li key={row.rowNumber} className="rounded-md bg-neutral-50 px-3 py-2">
                    {preview.detectedColumns
                      .filter((column) => mapping[column])
                      .map((column) => (
                        <p key={column}>
                          {fieldLabel(mapping[column])}：{cellText(row.cells[column]) || "—"}
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-between">
              <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={busy} onClick={() => setStep(3)}>
                上一步
              </button>
              <button
                className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white"
                type="button"
                disabled={busy || preview.summary.validRows < 1}
                onClick={() => void confirm()}
              >
                {busy ? "导入中…" : "确认导入"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
