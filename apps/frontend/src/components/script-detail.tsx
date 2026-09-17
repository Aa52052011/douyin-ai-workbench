import { formatDurationSeconds } from "../lib/ui-labels";
import type { ScriptView, TopicSourceView } from "../lib/script.types";

export function ScriptDetail({
  view,
  version,
  statusLabel,
  source,
}: {
  view: ScriptView;
  version?: number;
  statusLabel?: string;
  source?: TopicSourceView | null;
}) {
  return (
    <article className="space-y-4 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-medium break-words">{view.title}</h2>
        <p className="text-sm text-neutral-500">
          {[
            typeof version === "number" ? `版本 ${version}` : "",
            statusLabel,
            formatDurationSeconds(view.totalDuration),
            `约 ${view.estimatedWordCount} 字`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-neutral-500">系统已结合本批前后内容和账号历史，避免重复。</p>
      </header>
      {source ? (
        <section className="rounded-lg bg-neutral-50 px-3 py-3 text-sm">
          <h3 className="mb-1 font-medium">来源选题</h3>
          <p>{source.title}</p>
          {source.contentAngle ? <p className="text-neutral-600">内容角度：{source.contentAngle}</p> : null}
        </section>
      ) : null}
      <Field label="开场钩子" value={view.hook} />
      <Field label="开场" value={view.opening} />
      <section>
        <h3 className="mb-2 text-sm font-medium">分镜脚本</h3>
        <div className="space-y-3">
          {view.sections.map((section) => (
            <article key={section.sequence} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
              <p className="text-sm font-medium">
                第 {section.sequence} 段 · {section.duration} 秒
              </p>
              <Field label="旁白" value={section.narration} />
              <Field label="画面建议" value={section.visualSuggestion} />
              <Field label="字幕" value={section.subtitle} />
            </article>
          ))}
        </div>
      </section>
      <Field label="结尾" value={view.ending} />
      <Field label="希望观众下一步做什么" value={view.cta} />
      <Field label="配音风格" value={view.voiceStyle} />
      <Field label="视觉风格" value={view.visualStyle} />
      {view.productionNotes.length > 0 ? (
        <section>
          <h3 className="mb-1 text-sm font-medium">制作备注</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {view.productionNotes.map((note) => (
              <li key={note} className="break-words">
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="text-sm">
      <p className="text-neutral-500">{label}</p>
      <p className="whitespace-pre-wrap break-words text-neutral-800">{value}</p>
    </div>
  );
}
