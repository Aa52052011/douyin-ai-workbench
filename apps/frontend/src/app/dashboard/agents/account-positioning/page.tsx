"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../../lib/auth-context";
import { api } from "../../../../lib/api";
import type { AccountPositioningOutput, AgentRun, Project } from "../../../../lib/types";

const emptyForm = {
  industry: "",
  platform: "douyin",
  accountType: "",
  goal: "",
  targetAudience: "",
  expertise: "",
  additionalInfo: "",
};

export default function AccountPositioningPage() {
  const { accessToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadHistory(id: string) {
    if (!accessToken || !id) {
      return;
    }
    const rows = await api<AgentRun[]>(
      `/agents/runs?projectId=${encodeURIComponent(id)}&agentId=account.positioning`,
      { accessToken },
    );
    setHistory(rows);
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
          return loadHistory(first.id);
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
          agentId: "account.positioning",
          agentVersion: "v1",
          projectId,
          input: {
            industry: form.industry,
            platform: form.platform,
            accountType: form.accountType,
            goal: form.goal,
            targetAudience: form.targetAudience || undefined,
            expertise: form.expertise || undefined,
            additionalInfo: form.additionalInfo || undefined,
          },
        }),
      });
      setRun(data);
      await loadHistory(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setBusy(false);
    }
  }

  const output = isPositioningOutput(run?.output) ? run.output : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <section>
        <h1 className="text-2xl font-semibold">账号定位</h1>
        <p className="mt-1 text-sm text-neutral-600">
          account.positioning:v1 · 根据账号信息生成结构化定位，不调用外部社媒数据。
        </p>
      </section>

      <form className="grid gap-3 rounded border p-4 md:grid-cols-2" onSubmit={(event) => void execute(event)}>
        <select
          className="rounded border px-3 py-2 md:col-span-2"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            void loadHistory(event.target.value).catch((err: Error) => setError(err.message));
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
        <Field label="行业" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} required maxLength={100} />
        <Field label="平台" value={form.platform} onChange={(platform) => setForm({ ...form, platform })} required maxLength={50} />
        <Field label="账号类型" value={form.accountType} onChange={(accountType) => setForm({ ...form, accountType })} required maxLength={100} />
        <Field label="目标" value={form.goal} onChange={(goal) => setForm({ ...form, goal })} required maxLength={500} />
        <Field label="目标用户" value={form.targetAudience} onChange={(targetAudience) => setForm({ ...form, targetAudience })} maxLength={500} />
        <Field label="个人擅长" value={form.expertise} onChange={(expertise) => setForm({ ...form, expertise })} maxLength={1000} />
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          补充信息
          <textarea
            className="min-h-24 rounded border px-3 py-2"
            value={form.additionalInfo}
            maxLength={2000}
            onChange={(event) => setForm({ ...form, additionalInfo: event.target.value })}
          />
        </label>
        <button className="rounded bg-black px-4 py-2 text-white md:col-span-2" disabled={busy} type="submit">
          {busy ? "分析中..." : "开始分析"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {run ? (
        <section className="grid gap-2 rounded border px-4 py-3 text-sm md:grid-cols-2">
          <Meta label="状态" value={run.status} />
          <Meta label="耗时" value={`${run.durationMs ?? "-"} ms`} />
          <Meta label="版本" value={`${run.agentId}:${run.agentVersion}`} />
          <Meta label="requestId" value={run.requestId} />
          <Meta
            label="Token"
            value={`${run.usage?.inputTokens ?? "-"} / ${run.usage?.outputTokens ?? "-"} / ${run.usage?.totalTokens ?? "-"}`}
          />
        </section>
      ) : null}

      {output ? <ResultView output={output} /> : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">最近执行记录</h2>
        <ul className="space-y-2">
          {history.map((item) => (
            <li key={item.id} className="rounded border px-3 py-2 text-sm">
              <span className="font-medium">{item.status}</span>
              <span className="ml-2 text-neutral-600">{item.agentVersion}</span>
              <span className="ml-2 text-neutral-500">{item.requestId}</span>
            </li>
          ))}
          {history.length === 0 ? <li className="text-sm text-neutral-500">暂无记录</li> : null}
        </ul>
      </section>
    </main>
  );
}

function ResultView({ output }: { output: AccountPositioningOutput }) {
  return (
    <div className="space-y-4">
      <Card title="账号定位">{output.accountPositioning}</Card>
      <Card title="目标用户">
        <p>{output.targetAudience.description}</p>
        {output.targetAudience.demographics ? (
          <p className="mt-1 text-neutral-600">{output.targetAudience.demographics}</p>
        ) : null}
        <Tags values={output.targetAudience.interests} />
      </Card>
      <Card title="用户痛点">
        <List values={output.userPainPoints} />
      </Card>
      <Card title="内容赛道">
        {output.contentNiches.map((item) => (
          <p key={item.name} className="mb-2">
            <strong>{item.name}</strong> · {item.reason}
          </p>
        ))}
      </Card>
      <Card title="内容支柱">
        {output.contentPillars.map((item) => (
          <p key={item.name} className="mb-2">
            <strong>{item.name}</strong>
            {item.percentage != null ? ` ${item.percentage}%` : ""} · {item.description}
          </p>
        ))}
      </Card>
      <Card title="差异化">
        <List values={output.differentiation} />
      </Card>
      <Card title="人设">
        <p>
          {output.persona.identity} · {output.persona.tone}
        </p>
        <Tags values={output.persona.characteristics} />
      </Card>
      <Card title="账号简介">{output.profileBio}</Card>
      <Card title="内容形式">
        <Tags values={output.contentFormats} />
      </Card>
      <Card title="发布策略">
        <p>{output.publishingStrategy.frequency}</p>
        <p className="text-neutral-600">
          {[output.publishingStrategy.recommendedLength, output.publishingStrategy.recommendedStyle]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Card>
      <Card title="初始内容方向">
        {output.initialContentDirections.map((item) => (
          <div key={item.title} className="mb-3">
            <p className="font-medium">{item.title}</p>
            <p>{item.description}</p>
            <p className="text-neutral-600">{item.reason}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold text-neutral-500">{title}</h3>
      <div className="text-sm leading-6">{children}</div>
    </section>
  );
}

function List({ values }: { values: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {values.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Tags({ values }: { values?: string[] }) {
  if (!values?.length) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {values.map((item) => (
        <span key={item} className="rounded-full bg-neutral-100 px-2 py-1 text-xs">
          {item}
        </span>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className="rounded border px-3 py-2"
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-neutral-500">{label}：</span>
      {value}
    </p>
  );
}

function isPositioningOutput(value: unknown): value is AccountPositioningOutput {
  return Boolean(value && typeof value === "object" && "accountPositioning" in value && "persona" in value);
}
