"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import type { ContentPlan, ContentTopic, Project, Script } from "../../../lib/types";

export default function ScriptsPage() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [targetDuration, setTargetDuration] = useState(30);
  const [requirements, setRequirements] = useState("");
  const [scripts, setScripts] = useState<Script[]>([]);
  const [current, setCurrent] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedPlan = plans.find((item) => item.id === planId);
  const topics = selectedPlan?.payload?.topics ?? [];

  async function loadPlans(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const rows = await api<ContentPlan[]>(`/content-plans?projectId=${encodeURIComponent(id)}`, {
      accessToken,
    });
    const usable = rows.filter((item) => item.status === "CONFIRMED" || item.status === "ARCHIVED");
    setPlans(usable);
    const first = usable[0];
    setPlanId(first?.id ?? "");
    setTopicId(first?.payload.topics[0]?.id ?? "");
  }

  async function loadScripts(id: string, contentPlanId?: string) {
    if (!accessToken || !id) {
      return;
    }
    const query = new URLSearchParams({ projectId: id });
    if (contentPlanId) {
      query.set("contentPlanId", contentPlanId);
    }
    const rows = await api<Script[]>(`/scripts?${query.toString()}`, { accessToken });
    setScripts(rows);
    setCurrent(rows[0] ?? null);
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
          return Promise.all([loadPlans(first.id), loadScripts(first.id)]);
        }
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token-gated initial load
  }, [accessToken]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !planId || !topicId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<Script>("/scripts", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          contentPlanId: planId,
          topicId,
          targetDuration,
          requirements: requirements || undefined,
        }),
      });
      setCurrent(data);
      await loadScripts(projectId, planId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!accessToken || !current) {
      return;
    }
    setBusy(true);
    try {
      const data = await api<Script>(`/scripts/${current.id}/confirm`, {
        method: "POST",
        accessToken,
        headers: { "x-approval-source": "USER_UI" },
      });
      setCurrent(data);
      await loadScripts(projectId, planId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!accessToken || !current) {
      return;
    }
    setBusy(true);
    try {
      const data = await api<Script>(`/scripts/${current.id}/archive`, { method: "POST", accessToken });
      setCurrent(data);
      await loadScripts(projectId, planId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "归档失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section>
        <h1 className="text-2xl font-semibold">脚本生成</h1>
        <p className="mt-1 text-sm text-neutral-600">
          script.generation:v1 · 从已确认规划的 Topic 生成脚本，新版本不覆盖旧版本。
        </p>
      </section>

      <form className="grid gap-3 rounded border p-4 md:grid-cols-2" onSubmit={(event) => void generate(event)}>
        <select
          className="rounded border px-3 py-2"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            void Promise.all([loadPlans(event.target.value), loadScripts(event.target.value)]).catch(
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
        <select
          className="rounded border px-3 py-2"
          value={planId}
          onChange={(event) => {
            setPlanId(event.target.value);
            const next = plans.find((item) => item.id === event.target.value);
            setTopicId(next?.payload.topics[0]?.id ?? "");
            void loadScripts(projectId, event.target.value).catch((err: Error) => setError(err.message));
          }}
          required
        >
          <option value="" disabled>
            选择已确认规划
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              v{plan.version} {plan.title} · {plan.status}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-2 md:col-span-2"
          value={topicId}
          onChange={(event) => setTopicId(event.target.value)}
          required
        >
          <option value="" disabled>
            选择 Topic
          </option>
          {topics.map((topic: ContentTopic) => (
            <option key={topic.id} value={topic.id}>
              第{topic.dayIndex}天 · {topic.title}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-sm">
          目标时长（秒）
          <select
            className="rounded border px-3 py-2"
            value={targetDuration}
            onChange={(event) => setTargetDuration(Number(event.target.value))}
          >
            {[15, 30, 45, 60].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          额外要求
          <input
            className="rounded border px-3 py-2"
            value={requirements}
            maxLength={2000}
            onChange={(event) => setRequirements(event.target.value)}
          />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white md:col-span-2" disabled={busy || !topicId} type="submit">
          {busy ? "生成中..." : "生成脚本"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {current ? (
        <section className="space-y-3 rounded border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{current.title}</h2>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{current.status}</span>
            <span className="text-sm text-neutral-500">v{current.version}</span>
            <Link className="text-sm underline" href={`/dashboard/scripts/${current.id}`}>
              详情
            </Link>
          </div>
          <p className="text-sm text-neutral-600">Hook：{current.payload?.hook}</p>
          <p className="text-sm text-neutral-500">
            时长 {current.payload?.totalDuration}s · run {current.sourceAgentRunId?.slice(0, 8)}
          </p>
          <div className="flex gap-2">
            {current.status === "DRAFT" ? (
              <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void confirm()}>
                确认脚本
              </button>
            ) : null}
            {current.status === "CONFIRMED" ? (
              <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void archive()}>
                归档
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">脚本列表</h2>
        {scripts.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无脚本</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-2">标题</th>
                  <th className="px-3 py-2">Topic</th>
                  <th className="px-3 py-2">版本</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2">规划</th>
                  <th className="px-3 py-2">时长</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((item) => {
                  const topic = asTopic(item.topicSnapshot);
                  const plan = plans.find((row) => row.id === item.contentPlanId);
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <button className="underline" onClick={() => setCurrent(item)} type="button">
                          {item.title}
                        </button>
                        <Link className="ml-2 text-xs underline" href={`/dashboard/scripts/${item.id}`}>
                          详情
                        </Link>
                      </td>
                      <td className="px-3 py-2">{topic?.title ?? item.topicId ?? "-"}</td>
                      <td className="px-3 py-2">v{item.version}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{formatTime(item.createdAt)}</td>
                      <td className="px-3 py-2">{plan ? `v${plan.version} ${plan.title}` : item.contentPlanId?.slice(0, 8)}</td>
                      <td className="px-3 py-2">{item.payload?.totalDuration ?? "-"}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function asTopic(value: Script["topicSnapshot"]): ContentTopic | undefined {
  if (!value || typeof value !== "object" || !("title" in value)) {
    return undefined;
  }
  return value as ContentTopic;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN");
}
