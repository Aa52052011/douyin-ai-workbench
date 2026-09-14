"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  REFERENCE_INSUFFICIENT_HINT,
  REFERENCE_ORIGINALITY_DISCLAIMER,
  analysisStatusLabel,
  isInsufficientAnalysis,
  patternCardsFromAnalysis,
  type ReferenceAnalysisView,
  type ReferencePatternView,
} from "../../lib/reference-intelligence";

type ReferenceRow = {
  id: string;
  title: string | null;
  sourceLabel: string;
  note: string | null;
  url: string | null;
  assetId: string | null;
  referenceOnly: boolean;
};

export function ReferenceIntelligencePanel({
  projectId,
  accessToken,
}: {
  projectId: string;
  accessToken: string;
}) {
  const [items, setItems] = useState<ReferenceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReferenceAnalysisView | null>(null);
  const [patterns, setPatterns] = useState<ReferencePatternView[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(
    async (referenceId: string) => {
      try {
        const analysisRes = await api<{ analysis: ReferenceAnalysisView | null }>(
          `/projects/${projectId}/references/${referenceId}/analysis`,
          { accessToken },
        );
        setAnalysis(analysisRes.analysis);
        if (analysisRes.analysis?.status === "COMPLETED") {
          const patternRows = await api<ReferencePatternView[]>(
            `/projects/${projectId}/references/${referenceId}/patterns`,
            { accessToken },
          );
          setPatterns(patternRows);
        } else {
          setPatterns([]);
        }
      } catch {
        setAnalysis(null);
        setPatterns([]);
      }
    },
    [accessToken, projectId],
  );

  const selectReference = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessage(null);
      void loadDetail(id);
    },
    [loadDetail],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api<ReferenceRow[]>(`/projects/${projectId}/references`, {
          accessToken,
        });
        if (cancelled) return;
        setItems(rows);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, projectId]);

  async function runAnalyze(reanalyze = false) {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{
        analysis: ReferenceAnalysisView;
        patterns: ReferencePatternView[];
        assetProductionEligible: boolean | null;
      }>(`/projects/${projectId}/references/${selectedId}/analyze`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({ reanalyze }),
      });
      setAnalysis(result.analysis);
      setPatterns(result.patterns ?? []);
      if (result.assetProductionEligible === true) {
        setMessage("警告：参考素材不应可用于生产");
      } else if (isInsufficientAnalysis(result.analysis)) {
        setMessage(REFERENCE_INSUFFICIENT_HINT);
      } else {
        setMessage(reanalyze ? "已重新分析（新版本）" : "分析完成");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败");
    } finally {
      setBusy(false);
    }
  }

  const selected = items.find((x) => x.id === selectedId) ?? null;
  const cards = patternCardsFromAnalysis(analysis);
  const insufficient = isInsufficientAnalysis(analysis);

  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>参考内容结构分析</h2>
      <p style={{ margin: "0 0 12px", color: "#4b5563", fontSize: 14 }}>
        {REFERENCE_ORIGINALITY_DISCLAIMER}
      </p>

      {items.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>
          暂无已确认的参考内容。可在上方资料中添加「爆款参考」后确认市场调研。
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectReference(item.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedId === item.id ? "1px solid #111827" : "1px solid #d1d5db",
                  background: selectedId === item.id ? "#111827" : "#fff",
                  color: selectedId === item.id ? "#fff" : "#111827",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {item.title || item.sourceLabel}
              </button>
            ))}
          </div>

          {selected ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14, color: "#374151" }}>
                <div>来源：{selected.sourceLabel}</div>
                {selected.url ? <div>链接：{selected.url}</div> : null}
                {selected.note ? <div>说明：{selected.note}</div> : null}
                <div>用途：学习结构模式（参考素材不可用于成片）</div>
                <div>
                  分析状态：
                  {analysis ? analysis.statusLabel || analysisStatusLabel(analysis.status) : "未分析"}
                  {analysis ? ` · v${analysis.version}` : ""}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => void runAnalyze(false)}>
                  {busy ? "分析中…" : "分析结构"}
                </button>
                <button type="button" disabled={busy || !analysis} onClick={() => void runAnalyze(true)}>
                  重新分析
                </button>
              </div>

              {message ? <p style={{ margin: 0, fontSize: 13, color: "#1f2937" }}>{message}</p> : null}

              {insufficient ? (
                <div
                  style={{
                    padding: 12,
                    background: "#fff7ed",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#9a3412",
                  }}
                >
                  {typeof analysis?.payload?.message === "string" ? analysis.payload.message : REFERENCE_INSUFFICIENT_HINT}
                </div>
              ) : null}

              {cards.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 10,
                  }}
                >
                  {cards.map((card) => (
                    <div
                      key={card.label}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{card.label}</div>
                      <div style={{ fontSize: 14, color: "#111827" }}>{card.summary}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {patterns.length > 0 ? (
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13 }}>学到了什么（模式列表）</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {patterns.map((p) => (
                      <li key={p.id}>
                        {p.typeLabel || p.patternType}：{p.summary}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
