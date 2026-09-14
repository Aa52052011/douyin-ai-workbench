"use client";

import { useState } from "react";
import { AIRecommendation } from "./ai-recommendation";
import { SelectWithCustomInput } from "./select-with-custom";
import { SmartChoiceGroup } from "./smart-choice-group";
import { SmartFormField } from "./smart-form-field";
import { Textarea } from "./input";
import {
  acceptPendingSuggestion,
  applyUserEdit,
  createFieldState,
  receiveExternalValue,
  type FieldControllerStateV1,
} from "../../lib/ux/field-source";
import { createSelectWithCustomState } from "../../lib/ux/select-with-custom";

const STYLE_OPTIONS = [
  { value: "轻松自然", label: "轻松自然" },
  { value: "知识讲解", label: "知识讲解" },
  { value: "故事化", label: "故事化" },
  { value: "专业、简单易懂", label: "专业、简单易懂", recommended: true },
];

export function SmartFormFoundationPreview() {
  const [tone, setTone] = useState(createSelectWithCustomState(STYLE_OPTIONS, undefined, "专业、简单易懂"));
  const [clarification, setClarification] = useState("");
  const [audience, setAudience] = useState<FieldControllerStateV1<string>>(
    createFieldState("想给第一次了解这个品类的人看", "REUSED_FROM_CONTEXT"),
  );
  const [goal, setGoal] = useState<FieldControllerStateV1<string>>(
    createFieldState("让观众觉得专业但不难懂", "AI_PREFILLED"),
  );
  const [cta, setCta] = useState<FieldControllerStateV1<string>>(createFieldState("去主页看看", "AI_SUGGESTED"));
  const [choice, setChoice] = useState("轻松自然");
  const [customChoice, setCustomChoice] = useState("");

  return (
    <div className="space-y-4" data-acf-smart-form-preview="true">
      <SmartFormField
        label="表达风格"
        htmlFor="preview-style"
        optional
        helper="可以选常用风格，也可以自己写。"
        state={createFieldState(tone.selected, "AI_SUGGESTED")}
      >
        <SelectWithCustomInput
          id="preview-style"
          options={STYLE_OPTIONS}
          recommendedValue="专业、简单易懂"
          recommendedReason="根据账号定位推断，尚未当作你已确认。"
          state={tone}
          onChange={setTone}
          clarification={clarification}
          onClarificationChange={setClarification}
        />
      </SmartFormField>
      <SmartFormField label="想给谁看" htmlFor="preview-audience" optional state={audience}>
        <Textarea
          id="preview-audience"
          value={audience.value}
          onChange={(event) => setAudience(applyUserEdit(audience, event.target.value))}
        />
      </SmartFormField>
      <SmartFormField label="内容目标" htmlFor="preview-goal" optional state={goal}>
        <Textarea
          id="preview-goal"
          value={goal.value}
          onChange={(event) => setGoal(applyUserEdit(goal, event.target.value))}
        />
      </SmartFormField>
      <SmartFormField label="希望观众下一步做什么" htmlFor="preview-cta" optional state={cta}>
        <Textarea
          id="preview-cta"
          value={cta.value}
          onChange={(event) => setCta(applyUserEdit(cta, event.target.value))}
        />
      </SmartFormField>
      {cta.pendingSuggestion !== undefined ? (
        <AIRecommendation
          value={String(cta.pendingSuggestion)}
          reason="有新的建议，不会自动替换你改过的内容。"
          onAccept={() => setCta(acceptPendingSuggestion(cta))}
          onEdit={() => setCta({ ...cta, pendingSuggestion: undefined })}
        />
      ) : (
        <button
          className="text-xs underline"
          type="button"
          onClick={() => setCta(receiveExternalValue(cta, "评论区告诉我你最关心哪一步", "AI_SUGGESTED"))}
        >
          模拟新的建议
        </button>
      )}
      <SmartChoiceGroup
        name="preview-choice"
        selected={choice}
        onSelect={setChoice}
        allowCustom
        customValue={customChoice}
        onCustomChange={setCustomChoice}
        options={[
          { value: "轻松自然", label: "轻松自然", recommended: true, reason: "更接近当前账号语气" },
          { value: "知识讲解", label: "知识讲解", description: "把步骤讲清楚" },
          { value: "故事化", label: "故事化" },
        ]}
      />
    </div>
  );
}
