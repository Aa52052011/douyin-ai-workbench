import type { ScriptPayloadRecord, ScriptSectionRecord } from "../lib/script.types";

export function ScriptEditor({
  draft,
  pending,
  onChange,
}: {
  draft: ScriptPayloadRecord;
  pending: boolean;
  onChange: (next: ScriptPayloadRecord) => void;
}) {
  const sections = draft.sections ?? [];

  function updateSection(index: number, patch: Partial<ScriptSectionRecord>) {
    onChange({
      ...draft,
      sections: sections.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-600">编辑会修改当前草稿内容，不会创建新版本。</p>
      <LabeledInput id="script-title" label="标题" value={draft.title ?? ""} disabled={pending} onChange={(title) => onChange({ ...draft, title })} />
      <LabeledTextarea id="script-hook" label="开场钩子" value={draft.hook ?? ""} disabled={pending} onChange={(hook) => onChange({ ...draft, hook })} />
      <LabeledTextarea id="script-opening" label="开场" value={draft.opening ?? ""} disabled={pending} onChange={(opening) => onChange({ ...draft, opening })} />
      <section className="space-y-3">
        <h3 className="text-sm font-medium">分镜脚本</h3>
        {sections.map((section, index) => (
          <article key={section.sequence ?? index} className="space-y-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3">
            <p className="text-sm font-medium">第 {section.sequence ?? index + 1} 段</p>
            <LabeledInput
              id={`script-section-duration-${index}`}
              label="时长（秒）"
              type="number"
              value={String(section.duration ?? "")}
              disabled={pending}
              onChange={(value) => updateSection(index, { duration: Number(value) || 0 })}
            />
            <LabeledTextarea
              id={`script-section-narration-${index}`}
              label="旁白"
              value={section.narration ?? ""}
              disabled={pending}
              onChange={(narration) => updateSection(index, { narration })}
            />
            <LabeledTextarea
              id={`script-section-visual-${index}`}
              label="画面建议"
              value={section.visualSuggestion ?? ""}
              disabled={pending}
              onChange={(visualSuggestion) => updateSection(index, { visualSuggestion })}
            />
            <LabeledTextarea
              id={`script-section-subtitle-${index}`}
              label="字幕"
              value={section.subtitle ?? ""}
              disabled={pending}
              onChange={(subtitle) => updateSection(index, { subtitle })}
            />
          </article>
        ))}
      </section>
      <LabeledTextarea id="script-ending" label="结尾" value={draft.ending ?? ""} disabled={pending} onChange={(ending) => onChange({ ...draft, ending })} />
      <LabeledTextarea id="script-cta" label="CTA" value={draft.cta ?? ""} disabled={pending} onChange={(cta) => onChange({ ...draft, cta })} />
      <LabeledInput id="script-voice" label="配音风格" value={draft.voiceStyle ?? ""} disabled={pending} onChange={(voiceStyle) => onChange({ ...draft, voiceStyle })} />
      <LabeledInput id="script-visual" label="视觉风格" value={draft.visualStyle ?? ""} disabled={pending} onChange={(visualStyle) => onChange({ ...draft, visualStyle })} />
      <LabeledTextarea
        id="script-notes"
        label="制作备注"
        value={(draft.productionNotes ?? []).join("\n")}
        disabled={pending}
        onChange={(value) =>
          onChange({
            ...draft,
            productionNotes: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  );
}

function LabeledInput({
  id,
  label,
  value,
  disabled,
  type = "text",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function LabeledTextarea({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="w-full min-w-0 whitespace-pre-wrap break-words rounded-md border border-neutral-300 px-3 py-2 text-sm"
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
