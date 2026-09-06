"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import type {
  AccountPositioningOutput,
  AgentRun,
  ContentPlan,
  ContentTopic,
  Project,
} from "../../../lib/types";

export default function ContentPlanningPage() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [positioning, setPositioning] = useState<AccountPositioningOutput | null>(null);
  const [positioningRunId, setPositioningRunId] = useState("");
  const [planningDays] = useState(7);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [platform, setPlatform] = useState("douyin");
  const [contentStyle, setContentStyle] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPlans(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const rows = await api<ContentPlan[]>(`/content-plans?projectId=${encodeURIComponent(id)}`, {
      accessToken,
    });
    setPlans(rows);
    setPlan(rows[0] ?? null);
  }

  async function loadPositioning(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const rows = await api<AgentRun[]>(
      `/agents/runs?projectId=${encodeURIComponent(id)}&agentId=account.positioning`,
      { accessToken },
    );
    const completed = rows.find((item) => item.status === "COMPLETED" && isPositioningOutput(item.output));
    if (completed && isPositioningOutput(completed.output)) {
      setPositioning(completed.output);
      setPositioningRunId(completed.id);
    } else {
      setPositioning(null);
      setPositioningRunId("");
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void api<Project[]>("/projects", { accessToken })
      .then((projectList) => {
        setProjects(projectList);
        const first = projectList[0];
        if (first) {
          setProjectId(first.id);
          return Promise.all([loadPositioning(first.id), loadPlans(first.id)]);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !projectId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<ContentPlan>("/content-plans", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          projectId,
          planningDays,
          postsPerDay,
          platform,
          contentStyle: contentStyle || undefined,
          additionalRequirements: additionalRequirements || undefined,
          positioningRunId: positioningRunId || undefined,
          positioning: positioningRunId ? undefined : positioning ?? undefined,
        }),
      });
      setPlan(data);
      await loadPlans(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!accessToken || !plan) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<ContentPlan>(`/content-plans/${plan.id}/confirm`, {
        method: "POST",
        accessToken,
      });
      setPlan(data);
      await loadPlans(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!accessToken || !plan) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<ContentPlan>(`/content-plans/${plan.id}/archive`, {
        method: "POST",
        accessToken,
      });
      setPlan(data);
      await loadPlans(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "归档失败");
    } finally {
      setBusy(false);
    }
  }

  const topics = plan?.payload?.topics ?? [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section>
        <h1 className="text-2xl font-semibold">内容规划</h1>
        <p className="mt-1 text-sm text-neutral-600">
          content.planning:v1 · 当前仅支持 7 天规划，每天 1-5 条。生成新版本不会覆盖旧规划。
        </p>
      </section>

      <form className="grid gap-3 rounded border p-4 md:grid-cols-2" onSubmit={(event) => void generate(event)}>
        <select
          className="rounded border px-3 py-2 md:col-span-2"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            void Promise.all([loadPositioning(event.target.value), loadPlans(event.target.value)]).catch(
              (err: Error) => setError(err.message),
            );
          }}
          required
        >
          <option value="" disabled>
            选择项目
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-sm">
          规划周期
          <input className="rounded border px-3 py-2" value="7 天（V1 固定）" disabled />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          每天发布数量
          <input
            className="rounded border px-3 py-2"
            type="number"
            min={1}
            max={5}
            value={postsPerDay}
            onChange={(event) => setPostsPerDay(Number(event.target.value))}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          平台
          <input
            className="rounded border px-3 py-2"
            value={platform}
            maxLength={50}
            onChange={(event) => setPlatform(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          内容风格
          <input
            className="rounded border px-3 py-2"
            value={contentStyle}
            maxLength={200}
            onChange={(event) => setContentStyle(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          额外要求
          <textarea
            className="min-h-20 rounded border px-3 py-2"
            value={additionalRequirements}
            maxLength={2000}
            onChange={(event) => setAdditionalRequirements(event.target.value)}
          />
        </label>
        <section className="rounded border px-3 py-2 text-sm md:col-span-2">
          <p className="font-medium">账号定位</p>
          {positioning ? (
            <p className="mt-1 text-neutral-600">
              {positioning.accountPositioning}
              {positioningRunId ? ` · run ${positioningRunId.slice(0, 8)}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-neutral-500">当前项目还没有成功的账号定位，请先生成定位。</p>
          )}
        </section>
        <button className="rounded bg-black px-4 py-2 text-white md:col-span-2" disabled={busy || !positioning} type="submit">
          {busy ? "生成中..." : "生成内容规划"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {plan ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{plan.title}</h2>
            <StatusBadge status={plan.status} />
            <span className="text-sm text-neutral-500">v{plan.version}</span>
          </div>
          <p className="text-sm text-neutral-600">{plan.description}</p>
          <p className="text-sm text-neutral-500">
            {plan.planningDays} 天 × {plan.postsPerDay} 条/天 · {plan.platform} · sourceRun{" "}
            {plan.sourceAgentRunId?.slice(0, 8)}
          </p>
          <div className="flex gap-2">
            {plan.status === "DRAFT" ? (
              <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void confirm()}>
                确认规划
              </button>
            ) : null}
            {plan.status === "CONFIRMED" ? (
              <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void archive()}>
                归档
              </button>
            ) : null}
          </div>
          <TopicTable topics={topics} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">历史版本</h2>
        <ul className="space-y-2">
          {plans.map((item) => (
            <li key={item.id}>
              <button
                className="w-full rounded border px-3 py-2 text-left text-sm"
                onClick={() => setPlan(item)}
                type="button"
              >
                <StatusBadge status={item.status} />
                <span className="ml-2 font-medium">v{item.version}</span>
                <span className="ml-2">{item.title}</span>
              </button>
            </li>
          ))}
          {plans.length === 0 ? <li className="text-sm text-neutral-500">暂无规划</li> : null}
        </ul>
      </section>
    </main>
  );
}

function TopicTable({ topics }: { topics: ContentTopic[] }) {
  if (topics.length === 0) {
    return null;
  }
  return (
    <div className="overflow-x-auto rounded border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-3 py-2">天</th>
            <th className="px-3 py-2">标题</th>
            <th className="px-3 py-2">Hook</th>
            <th className="px-3 py-2">支柱</th>
            <th className="px-3 py-2">角度</th>
            <th className="px-3 py-2">时长</th>
            <th className="px-3 py-2">优先级</th>
            <th className="px-3 py-2">CTA</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.id} className="border-t align-top">
              <td className="px-3 py-2">{topic.dayIndex}</td>
              <td className="px-3 py-2">{topic.title}</td>
              <td className="px-3 py-2">{topic.hook}</td>
              <td className="px-3 py-2">{topic.contentPillar}</td>
              <td className="px-3 py-2">{topic.contentAngle}</td>
              <td className="px-3 py-2">{topic.estimatedDuration}</td>
              <td className="px-3 py-2">{topic.priority}</td>
              <td className="px-3 py-2">{topic.cta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{status}</span>;
}

function isPositioningOutput(value: unknown): value is AccountPositioningOutput {
  return Boolean(value && typeof value === "object" && "accountPositioning" in value && "persona" in value);
}
