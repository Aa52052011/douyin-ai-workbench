"use client";

import {
  DEFAULT_PROJECT_PLATFORM,
  PROJECT_PLATFORM_ENABLED_IDS,
  PROJECT_PLATFORM_FIELD_LABEL,
  PROJECT_PLATFORM_HELP,
  PROJECT_PLATFORM_OPTIONS,
  type ProjectPlatformId,
  projectPlatformSelectValue,
} from "../lib/project-platform";

const selectClass =
  "acf-field w-full min-w-0 rounded-md border border-[var(--acf-border)] bg-[var(--acf-surface-elevated)] px-3 py-2 text-sm sm:w-auto sm:min-w-[8rem]";

export function ProjectPlatformSelect({
  id = "project-platform",
  value,
  onChange,
  disabled,
  required,
  className,
  showHelp = true,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (next: ProjectPlatformId) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  showHelp?: boolean;
}) {
  const selectValue = projectPlatformSelectValue(value);
  const enabled = PROJECT_PLATFORM_OPTIONS.filter((item) => item.enabled);
  const helpId = `${id}-help`;

  return (
    <div className={className ?? "min-w-0"}>
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {PROJECT_PLATFORM_FIELD_LABEL}
      </label>
      <select
        id={id}
        className={selectClass}
        value={selectValue}
        disabled={disabled}
        required={required}
        aria-describedby={showHelp ? helpId : undefined}
        onChange={(event) => {
          const next = event.target.value as ProjectPlatformId;
          if (PROJECT_PLATFORM_ENABLED_IDS.includes(next)) {
            onChange(next);
          } else {
            onChange(DEFAULT_PROJECT_PLATFORM);
          }
        }}
      >
        {enabled.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {showHelp ? (
        <p id={helpId} className="mt-1 text-xs text-neutral-500">
          {PROJECT_PLATFORM_HELP}
        </p>
      ) : null}
    </div>
  );
}
