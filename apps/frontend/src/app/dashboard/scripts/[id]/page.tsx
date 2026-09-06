"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../lib/auth-context";
import { api } from "../../../../lib/api";
import type { Script, ScriptPayload } from "../../../../lib/types";

export default function ScriptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [script, setScript] = useState<Script | null>(null);
  const [draft, setDraft] = useState<ScriptPayload | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) {
      return;
    }
    void api<Script>(`/scripts/${id}`, { accessToken })
      .then((data) => {
        setScript(data);
        setTitle(data.title);
        setDraft(data.payload);
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken, id]);

  const readonly = script?.status !== "DRAFT";

  async function act(path: "confirm" | "archive") {
    if (!accessToken || !id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<Script>(`/scripts/${id}/${path}`, { method: "POST", accessToken });
      setScript(data);
      setTitle(data.title);
      setDraft(data.payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!accessToken || !id || !draft) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<Script>(`/scripts/${id}`, {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({ title, payload: draft }),
      });
      setScript(data);
      setTitle(data.title);
      setDraft(data.payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  if (!script || !draft) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : <p>加载中…</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <Link className="text-sm underline" href="/dashboard/scripts">
        返回列表
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{script.title}</h1>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{script.status}</span>
        <span className="text-sm text-neutral-500">v{script.version}</span>
      </div>
      <p className="text-sm text-neutral-500">
        时长 {draft.totalDuration}s · 字数 {draft.estimatedWordCount} · run {script.sourceAgentRunId}
      </p>
      {readonly ? <p className="text-sm text-neutral-500">已确认或归档，只读。</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        {script.status === "DRAFT" ? (
          <>
            <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void save()}>
              保存修改
            </button>
            <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void act("confirm")}>
              确认
            </button>
          </>
        ) : null}
        {script.status === "CONFIRMED" ? (
          <button className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={() => void act("archive")}>
            归档
          </button>
        ) : null}
      </div>
      <Field label="标题" readonly={readonly} value={title} onChange={setTitle} />
      <Field label="Hook" readonly={readonly} value={draft.hook} onChange={(value) => setDraft({ ...draft, hook: value })} />
      <Field
        label="Opening"
        readonly={readonly}
        value={draft.opening}
        onChange={(value) => setDraft({ ...draft, opening: value })}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">分段</h2>
        {draft.sections.map((section, index) => (
          <div key={section.sequence} className="rounded border px-4 py-3 text-sm">
            <p className="font-medium">
              {section.sequence}. {section.duration}s
            </p>
            <Field
              label="口播"
              readonly={readonly}
              value={section.narration}
              onChange={(value) => {
                const sections = draft.sections.map((item, i) => (i === index ? { ...item, narration: value } : item));
                setDraft({ ...draft, sections });
              }}
            />
            <p className="mt-1 text-neutral-600">画面：{section.visualSuggestion}</p>
            <p className="text-neutral-500">字幕：{section.subtitle}</p>
          </div>
        ))}
      </section>
      <Field label="Ending" readonly={readonly} value={draft.ending} onChange={(value) => setDraft({ ...draft, ending: value })} />
      <Field label="CTA" readonly={readonly} value={draft.cta} onChange={(value) => setDraft({ ...draft, cta: value })} />
      <Field
        label="口播风格"
        readonly={readonly}
        value={draft.voiceStyle}
        onChange={(value) => setDraft({ ...draft, voiceStyle: value })}
      />
      <Field
        label="画面风格"
        readonly={readonly}
        value={draft.visualStyle}
        onChange={(value) => setDraft({ ...draft, visualStyle: value })}
      />
      <Field
        label="制作备注"
        readonly={readonly}
        value={(draft.productionNotes ?? []).join("\n")}
        onChange={(value) =>
          setDraft({
            ...draft,
            productionNotes: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />
    </main>
  );
}

function Field({
  label,
  value,
  readonly,
  onChange,
}: {
  label: string;
  value: string;
  readonly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded border px-4 py-3">
      <h3 className="mb-1 text-sm font-semibold text-neutral-500">{label}</h3>
      {readonly ? (
        <div className="whitespace-pre-wrap text-sm leading-6">{value}</div>
      ) : (
        <textarea
          className="w-full rounded border px-3 py-2 text-sm leading-6"
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </section>
  );
}
