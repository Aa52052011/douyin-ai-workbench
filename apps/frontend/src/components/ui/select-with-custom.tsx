"use client";

import { useState } from "react";
import {
  applyCustomText,
  applySelectChange,
  CUSTOM_SELECT_VALUE,
  isCustomSelected,
  type SelectOptionV1,
  type SelectWithCustomStateV1,
} from "../../lib/ux/select-with-custom";
import { Input, Select, Textarea } from "./input";

export function SelectWithCustomInput({
  id,
  options,
  recommendedValue,
  recommendedReason,
  state,
  onChange,
  customPlaceholder = "描述你希望的风格",
  clarificationLabel = "补充说明",
  clarification,
  onClarificationChange,
}: {
  id?: string;
  options: SelectOptionV1[];
  recommendedValue?: string;
  recommendedReason?: string;
  state: SelectWithCustomStateV1;
  onChange: (next: SelectWithCustomStateV1) => void;
  customPlaceholder?: string;
  clarificationLabel?: string;
  clarification?: string;
  onClarificationChange?: (value: string) => void;
}) {
  const [openNote] = useState(true);
  return (
    <div className="space-y-2">
      {recommendedValue ? (
        <p className="acf-caption">
          根据前置信息推荐：{recommendedValue}
          {recommendedReason ? ` · ${recommendedReason}` : ""}
        </p>
      ) : null}
      <Select
        id={id}
        value={state.selected}
        onChange={(event) => onChange(applySelectChange(state, event.target.value))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.recommended ? `推荐 · ${option.label}` : option.label}
          </option>
        ))}
        <option value={CUSTOM_SELECT_VALUE}>自定义</option>
      </Select>
      {isCustomSelected(state) ? (
        <Textarea
          value={state.customText}
          placeholder={customPlaceholder}
          onChange={(event) => onChange(applyCustomText(state, event.target.value))}
        />
      ) : null}
      {onClarificationChange && openNote ? (
        <Input
          aria-label={clarificationLabel}
          placeholder={`${clarificationLabel}（选填）`}
          value={clarification ?? ""}
          onChange={(event) => onClarificationChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
