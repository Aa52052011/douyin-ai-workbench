import type { ReactNode } from "react";
import type { PositioningOutput } from "../lib/positioning.types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="space-y-2 text-sm leading-6">{children}</div>
    </section>
  );
}

function Chips({ values }: { values?: string[] }) {
  if (!values?.length) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((item) => (
        <li key={item} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PositioningSummary({ output }: { output: PositioningOutput }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <Section title="一句话账号定位">
        <p>{output.accountPositioning}</p>
      </Section>
      <Section title="目标受众">
        <p>{output.targetAudience.description}</p>
        {output.targetAudience.demographics ? (
          <p className="text-neutral-600">{output.targetAudience.demographics}</p>
        ) : null}
        <Chips values={output.targetAudience.interests} />
      </Section>
      <Section title="人设">
        <p>
          {output.persona.identity} · {output.persona.tone}
        </p>
        <Chips values={output.persona.characteristics} />
      </Section>
      {output.userPainPoints.length ? (
        <Section title="用户痛点">
          <ul className="list-disc space-y-1 pl-5">
            {output.userPainPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {output.contentPillars.length ? (
        <Section title="内容支柱">
          {output.contentPillars.map((item) => (
            <p key={item.name}>
              <strong>{item.name}</strong>
              {item.percentage != null ? ` ${item.percentage}%` : ""} · {item.description}
            </p>
          ))}
        </Section>
      ) : null}
      {output.contentNiches.length ? (
        <Section title="内容方向">
          {output.contentNiches.map((item) => (
            <p key={item.name}>
              <strong>{item.name}</strong> · {item.reason}
            </p>
          ))}
        </Section>
      ) : null}
      {output.differentiation.length ? (
        <Section title="差异化">
          <ul className="list-disc space-y-1 pl-5">
            {output.differentiation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {output.contentFormats.length ? (
        <Section title="内容形式">
          <Chips values={output.contentFormats} />
        </Section>
      ) : null}
      <Section title="发布建议">
        <p>{output.publishingStrategy.frequency}</p>
        <p className="text-neutral-600">
          {[output.publishingStrategy.recommendedLength, output.publishingStrategy.recommendedStyle]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Section>
      {output.profileBio ? (
        <Section title="账号简介">
          <p>{output.profileBio}</p>
        </Section>
      ) : null}
      {output.initialContentDirections.length ? (
        <Section title="初期内容方向">
          {output.initialContentDirections.map((item) => (
            <div key={item.title}>
              <p className="font-medium">{item.title}</p>
              <p>{item.description}</p>
              <p className="text-neutral-600">{item.reason}</p>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}
