"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import type { AgentDefinition, AgentRun, Project } from "../../../lib/types";

export default function AgentTestPage() {
  const { accessToken } = useAuth();
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("hello");
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void Promise.all([
      api<AgentDefinition[]>("/agents", { accessToken }),
      api<Project[]>("/projects", { accessToken }),
    ])
      .then(([agentList, projectList]) => {
        setAgents(agentList);
        setProjects(projectList);
        if (projectList[0]) {
          setProjectId(projectList[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken]);

  async function execute(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !projectId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<AgentRun>("/agents/runs", {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          agentId: "system.echo",
          agentVersion: "v1",
          projectId,
          input: { message },
        }),
      });
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <section>
        <h1 className="text-2xl font-semibold">Agent 测试</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Engine 联调用 system.echo。业务 Agent：
          <Link className="ml-1 underline" href="/dashboard/agents/account-positioning">
            账号定位
          </Link>
          、
          <Link className="ml-1 underline" href="/dashboard/content-planning">
            内容规划
          </Link>
          。
        </p>
      </section>

      <ul className="rounded border px-4 py-3 text-sm">
        {agents.map((agent) => (
          <li key={`${agent.id}:${agent.version}`}>
            <strong>{agent.id}</strong>:{agent.version} — {agent.description}
          </li>
        ))}
        {agents.length === 0 ? <li>未发现 Agent</li> : null}
      </ul>

      <form className="flex flex-col gap-3" onSubmit={(event) => void execute(event)}>
        <select
          className="rounded border px-3 py-2"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
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
        <input
          className="rounded border px-3 py-2"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="message"
          required
        />
        <button className="rounded bg-black px-4 py-2 text-white" disabled={busy} type="submit">
          {busy ? "执行中…" : "执行 system.echo"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {run ? (
        <section className="space-y-2 rounded border px-4 py-3 text-sm">
          <p>状态：{run.status}</p>
          <p>requestId：{run.requestId}</p>
          <p>版本：{run.agentId}:{run.agentVersion}</p>
          <p>耗时：{run.durationMs ?? "-"} ms</p>
          <pre className="overflow-auto rounded bg-neutral-50 p-3">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
