import type { ReactNode } from "react";
import type { ScriptPayloadRecord, ScriptSectionRecord, ScriptView } from "../lib/script.types";

export function ScriptEditorV2({
  draft,
  view,
  pending,
  readOnly,
  onChange,
}: {
  draft?: ScriptPayloadRecord | null;
  view?: ScriptView | null;
  pending?: boolean;
  readOnly?: boolean;
  onChange?: (next: ScriptPayloadRecord) => void;
}) {
  const source = draft ?? view;
  if (!source) return null;
  const sections = source.sections ?? [];
  const duration = source.totalDuration;
  const editing = Boolean(draft && onChange && !readOnly);

  function update(patch: Partial<ScriptPayloadRecord>) {
    if (!draft || !onChange) return;
    onChange({ ...draft, ...patch });
  }

  function updateSection(index: number, patch: Partial<ScriptSectionRecord>) {
    if (!draft || !onChange) return;
    onChange({
      ...draft,
      sections: sections.map((item, current) => (current === index ? { ...item, ...patch } : item)),
    });
  }

  return (
    <article className="space-y-6" data-acf-script-editor-v2>
      {!editing ? <p className="sr-only">编辑会修改当前草稿内容，不会创建新版本。</p> : null}
      {editing ? <p className="acf-caption">编辑会修改当前草稿内容，不会创建新版本。</p> : null}
      <header className="space-y-1 border-b border-[var(--acf-border-subtle)] pb-4">
        {editing ? (
          <LabeledTextarea id="script-title" label="标题" value={draft?.title ?? ""} disabled={pending} onChange={(title) => update({ title })} rows={1} />
        ) : (
          <h2 className="acf-section-title break-words">{source.title}</h2>
        )}
        <p className="acf-caption">
          {[
            typeof duration === "number" && duration > 0 ? `预计 ${duration} 秒` : "",
            source.voiceStyle,
            source.visualStyle,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <Section title="开头">
        {editing ? (
          <>
            <LabeledTextarea id="script-hook" label="开场钩子" value={draft?.hook ?? ""} disabled={pending} onChange={(hook) => update({ hook })} />
            <LabeledTextarea id="script-opening" label="开场" value={draft?.opening ?? ""} disabled={pending} onChange={(opening) => update({ opening })} />
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-sm">{source.hook}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{source.opening}</p>
          </>
        )}
      </Section>

      <Section title="正文">
        {sections.map((section, index) => (
          <div key={section.sequence ?? index} className="border-t border-[var(--acf-border-subtle)] py-3 first:border-t-0 first:pt-0">
            <p className="acf-caption mb-1">第 {section.sequence ?? index + 1} 段</p>
            {editing ? (
              <LabeledTextarea
                id={`script-section-narration-${index}`}
                label="旁白"
                value={section.narration ?? ""}
                disabled={pending}
                onChange={(narration) => updateSection(index, { narration })}
              />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm">{section.narration}</p>
            )}
          </div>
        ))}
      </Section>

      <Section title="结尾">
        {editing ? (
          <LabeledTextarea id="script-ending" label="结尾" value={draft?.ending ?? ""} disabled={pending} onChange={(ending) => update({ ending })} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{source.ending}</p>
        )}
      </Section>

      <Section title="希望观众下一步做什么">
        {editing ? (
          <LabeledTextarea id="script-cta" label="希望观众下一步做什么" value={draft?.cta ?? ""} disabled={pending} onChange={(cta) => update({ cta })} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{source.cta}</p>
        )}
      </Section>

      <details className="border-t border-[var(--acf-border-subtle)] pt-3">
        <summary className="cursor-pointer text-sm font-medium">查看制作建议</summary>
        <div className="mt-3 space-y-3 text-sm">
          {editing ? (
            <>
              {sections.map((section, index) => (
                <div key={`note-${section.sequence ?? index}`} className="space-y-2">
                  <p className="acf-caption">第 {section.sequence ?? index + 1} 段制作提示</p>
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
                </div>
              ))}
              <LabeledTextarea
                id="script-notes"
                label="制作备注"
                value={(draft?.productionNotes ?? []).join("\n")}
                disabled={pending}
                onChange={(value) =>
                  update({
                    productionNotes: value
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </>
          ) : (
            <>
              {sections.map((section, index) => (
                <div key={`ro-${section.sequence ?? index}`}>
                  {section.visualSuggestion ? <p>画面：{section.visualSuggestion}</p> : null}
                  {section.subtitle ? <p>字幕：{section.subtitle}</p> : null}
                </div>
              ))}
              {(source.productionNotes ?? []).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </>
          )}
        </div>
      </details>
    </article>
  );
}

export function ScriptEditor({
  draft,
  pending,
  onChange,
}: {
  draft: ScriptPayloadRecord;
  pending: boolean;
  onChange: (next: ScriptPayloadRecord) => void;
}) {
  return <ScriptEditorV2 draft={draft} pending={pending} onChange={onChange} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function LabeledTextarea({
  id,
  label,
  value,
  disabled,
  onChange,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="acf-field w-full min-w-0 whitespace-pre-wrap break-words rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm"
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
