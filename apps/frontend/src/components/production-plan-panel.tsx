"use client";

import { useState } from "react";
import { api } from "../lib/api";
import {
  PRODUCTION_PLAN_DISCLAIMER,
  type ProductionPlanView,
} from "../lib/production-director";
import { formatDurationSeconds } from "../lib/ui-labels";
import type { TimelinePublicView } from "../lib/editing-timeline";

export function ProductionPlanPanel({
  videoId,
  accessToken,
}: {
  videoId: string;
  accessToken: string;
}) {
  const [plan, setPlan] = useState<ProductionPlanView | null>(null);
  const [timeline, setTimeline] = useState<TimelinePublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [skipShoot, setSkipShoot] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [data, tl] = await Promise.all([
        api<ProductionPlanView>(`/videos/${videoId}/production-plan`, { accessToken }),
        api<TimelinePublicView>(`/videos/${videoId}/timeline`, { accessToken }).catch(() => null),
      ]);
      setPlan(data);
      setTimeline(tl);
      setError(null);
      setLoadedOnce(true);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "无法加载制作方案");
      setLoadedOnce(true);
    } finally {
      setBusy(false);
    }
  }

  async function rebuild(regenerate: boolean) {
    setBusy(true);
    try {
      const data = await api<ProductionPlanView>(`/videos/${videoId}/production-plan`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({ regenerate }),
      });
      setPlan(data);
      setTimeline(
        await api<TimelinePublicView>(`/videos/${videoId}/timeline`, { accessToken }).catch(() => null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新规划失败");
    } finally {
      setBusy(false);
    }
  }

  if (!loadedOnce && !plan && !error) {
    return (
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>制作方案</h2>
        <button type="button" disabled={busy} onClick={() => void load()}>
          {busy ? "加载中…" : "查看制作方案"}
        </button>
      </section>
    );
  }

  if (error && !plan) {
    return (
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>制作方案</h2>
        <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
        <button type="button" disabled={busy} onClick={() => void load()}>
          重试
        </button>
      </section>
    );
  }

  if (!plan) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fff",
      }}
    >
      <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>制作方案</h2>
      <p style={{ margin: "0 0 8px", fontSize: 14 }}>{plan.rationale}</p>
      <div style={{ display: "grid", gap: 6, fontSize: 14, color: "#374151" }}>
        <div>制作方式：{plan.modeLabel}</div>
        <div>
          预计时长：{formatDurationSeconds(plan.targetDuration)} · 镜头数：{plan.shotCount}
        </div>
        <div>
          旁白：{plan.voiceStrategyLabel} · 字幕：{plan.subtitleStrategyLabel} · 节奏：
          {plan.pacingStrategyLabel}
        </div>
        <div>画面策略：{plan.visualStrategy}</div>
        <div>素材来源概览：{plan.sourceOverview.join("、") || "系统自动选择"}</div>
        {plan.referencePatternCount > 0 ? (
          <div>已参考 {plan.referencePatternCount} 个结构模式（仅结构，不使用参考素材）</div>
        ) : null}
      </div>

      {plan.warnings.length > 0 ? (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "#9a3412" }}>
          {plan.warnings.map((w: string) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {timeline ? (
        <div style={{ marginTop: 12, padding: 10, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>素材解析 / 时间线摘要</div>
          <div>{timeline.summary}</div>
          <div style={{ marginTop: 4 }}>
            使用已有素材 {timeline.reusedAssetCount ?? 0} 个 · AI 补充 {timeline.generatedShotCount ?? 0} 个 · 时长{" "}
            {timeline.durationLabel}
          </div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {(timeline.shots ?? []).map((shot) => (
              <li key={shot.sequence}>
                镜头 {shot.sequence} {shot.timeLabel} {shot.mediaLabel} · {shot.sourceLabel}
              </li>
            ))}
          </ul>
          {(timeline.warnings ?? []).length > 0 ? (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#9a3412" }}>
              {(timeline.warnings ?? []).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {plan.shootingGuidance.length > 0 && !skipShoot ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "#f8fafc",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            如果方便，可以补拍这些镜头，真实感会更好（可选，不是必须）：
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plan.shootingGuidance.map(
              (g: {
                shotDescription: string;
                duration: number;
                framing: string;
                action: string;
              }) => (
                <li key={`${g.shotDescription}-${g.duration}`}>
                  {g.shotDescription} · 约 {g.duration} 秒 · {g.framing} · {g.action}
                </li>
              ),
            )}
          </ul>
          <button type="button" style={{ marginTop: 8 }} onClick={() => setSkipShoot(true)}>
            无法拍摄 / 跳过
          </button>
        </div>
      ) : null}

      {skipShoot || plan.shootingGuidance.length === 0 ? (
        <p style={{ marginTop: 10, fontSize: 13, color: "#4b5563" }}>{PRODUCTION_PLAN_DISCLAIMER}</p>
      ) : (
        <p style={{ marginTop: 10, fontSize: 13, color: "#4b5563" }}>{plan.fallbackSummary}</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={busy} onClick={() => void rebuild(false)}>
          刷新方案
        </button>
        <button type="button" disabled={busy} onClick={() => void rebuild(true)}>
          重新规划
        </button>
      </div>
    </section>
  );
}
