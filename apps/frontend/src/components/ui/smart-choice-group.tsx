"use client";

import { Input, Radio } from "./input";

export function SmartChoiceGroup({
  name,
  options,
  selected,
  onSelect,
  allowCustom,
  customValue,
  onCustomChange,
}: {
  name: string;
  options: Array<{ value: string; label: string; description?: string; recommended?: boolean; reason?: string }>;
  selected: string;
  onSelect: (value: string) => void;
  allowCustom?: boolean;
  customValue?: string;
  onCustomChange?: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-start gap-2 text-sm">
          <Radio
            name={name}
            checked={selected === option.value}
            onChange={() => onSelect(option.value)}
            value={option.value}
          />
          <span>
            {option.label}
            {option.recommended ? <span className="ml-1 acf-caption">推荐</span> : null}
            {option.description ? <span className="mt-0.5 block acf-caption">{option.description}</span> : null}
            {option.reason ? <span className="mt-0.5 block acf-caption">{option.reason}</span> : null}
          </span>
        </label>
      ))}
      {allowCustom ? (
        <label className="block text-sm">
          <span className="acf-caption">自定义</span>
          <Input className="mt-1" value={customValue ?? ""} onChange={(event) => onCustomChange?.(event.target.value)} />
        </label>
      ) : null}
    </fieldset>
  );
}
