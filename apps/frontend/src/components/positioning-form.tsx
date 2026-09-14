"use client";

import { useMemo, useState } from "react";
import type { PositioningFieldErrors } from "../lib/positioning.form";
import { POSITIONING_INPUT_LIMITS, type PositioningFormState } from "../lib/positioning.types";
import {
  applyUserEdit,
  createFieldState,
  receiveExternalValue,
  type FieldControllerStateV1,
} from "../lib/ux/field-source";
import { SelectWithCustomInput } from "./ui/select-with-custom";
import { SmartChoiceGroup } from "./ui/smart-choice-group";
import { SmartFormField } from "./ui/smart-form-field";
import { Input, Textarea } from "./ui/input";
import { createSelectWithCustomState, resolvedSelectValue } from "../lib/ux/select-with-custom";
import { Button } from "./ui/button";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "个人口播号", label: "个人口播号" },
  { value: "品牌号", label: "品牌号" },
  { value: "店铺号", label: "店铺号" },
];

const STYLE_CHOICES = [
  { value: "轻松自然", label: "轻松自然" },
  { value: "专业、简单易懂", label: "专业、简单易懂", recommended: true },
  { value: "故事化", label: "故事化" },
];

export function PositioningForm({
  form,
  errors,
  pending,
  reuseHint,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: PositioningFormState;
  errors: PositioningFieldErrors;
  pending: boolean;
  reuseHint?: boolean;
  onChange: (next: PositioningFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [audience, setAudience] = useState<FieldControllerStateV1<string>>(() =>
    createFieldState(form.targetAudience, form.targetAudience ? "REUSED_FROM_CONTEXT" : "USER_ENTERED"),
  );
  const [goal, setGoal] = useState<FieldControllerStateV1<string>>(() =>
    createFieldState(form.goal, form.goal ? "AI_PREFILLED" : "USER_ENTERED"),
  );
  const [style, setStyle] = useState<FieldControllerStateV1<string>>(() =>
    createFieldState(form.expertise, form.expertise ? "AI_SUGGESTED" : "USER_ENTERED"),
  );
  const [typeState, setTypeState] = useState(() => createSelectWithCustomState(ACCOUNT_TYPE_OPTIONS, form.accountType));
  const [styleChoice, setStyleChoice] = useState(form.expertise && STYLE_CHOICES.some((item) => item.value === form.expertise) ? form.expertise : "轻松自然");
  const [styleCustom, setStyleCustom] = useState(
    form.expertise && !STYLE_CHOICES.some((item) => item.value === form.expertise) ? form.expertise : "",
  );

  const advancedDefaultOpen = useMemo(
    () => Boolean(errors.industry || errors.platform || errors.additionalInfo),
    [errors.industry, errors.platform, errors.additionalInfo],
  );

  function patch(next: Partial<PositioningFormState>) {
    onChange({ ...form, ...next });
  }

  return (
    <form
      className="mx-auto max-w-xl space-y-5 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {reuseHint ? (
        <p className="text-sm text-neutral-600">已根据你前面提供的信息填写，可以直接改。</p>
      ) : null}

      <SmartFormField label="你希望账号给人什么感觉？" htmlFor="accountType" required error={errors.accountType} state={createFieldState(form.accountType, form.accountType ? "REUSED_FROM_CONTEXT" : "USER_ENTERED")}>
        <SelectWithCustomInput
          id="accountType"
          options={ACCOUNT_TYPE_OPTIONS}
          state={typeState}
          onChange={(next) => {
            setTypeState(next);
            patch({ accountType: resolvedSelectValue(next) });
          }}
          customPlaceholder="用自己的话描述账号类型"
        />
      </SmartFormField>

      <SmartFormField label="你的内容主要给谁看？" htmlFor="targetAudience" optional error={errors.targetAudience} state={audience}>
        <Textarea
          id="targetAudience"
          value={audience.value}
          maxLength={POSITIONING_INPUT_LIMITS.targetAudience}
          disabled={pending}
          onChange={(event) => {
            const next = applyUserEdit(audience, event.target.value);
            setAudience(next);
            patch({ targetAudience: next.value });
          }}
        />
      </SmartFormField>

      <SmartFormField label="你希望账号做成什么样？" htmlFor="goal" required error={errors.goal} state={goal}>
        <Textarea
          id="goal"
          value={goal.value}
          maxLength={POSITIONING_INPUT_LIMITS.goal}
          required
          disabled={pending}
          onChange={(event) => {
            const next = applyUserEdit(goal, event.target.value);
            setGoal(next);
            patch({ goal: next.value });
          }}
        />
      </SmartFormField>

      <SmartFormField label="你希望内容怎么表达？" htmlFor="expertise" optional error={errors.expertise} state={style} helper="可以选常用风格，也可以自己写。">
        <SmartChoiceGroup
          name="content-style"
          selected={styleChoice}
          onSelect={(value) => {
            setStyleChoice(value);
            const next = applyUserEdit(style, value);
            setStyle(next);
            patch({ expertise: next.value });
          }}
          allowCustom
          customValue={styleCustom}
          onCustomChange={(value) => {
            setStyleCustom(value);
            const next = applyUserEdit(style, value);
            setStyle(next);
            patch({ expertise: next.value });
          }}
          options={STYLE_CHOICES}
        />
      </SmartFormField>

      {goal.pendingSuggestion !== undefined ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <p>当前值：{goal.value}</p>
          <p className="mt-1">新的建议：{String(goal.pendingSuggestion)}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => {
                const next = { value: goal.pendingSuggestion as string, source: "AI_SUGGESTED" as const, editable: true as const };
                setGoal(next);
                patch({ goal: next.value });
              }}
            >
              应用
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setGoal({ ...goal, pendingSuggestion: undefined })}>
              忽略
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="text-xs underline"
          type="button"
          onClick={() => setGoal(receiveExternalValue(goal, "让观众觉得专业但不难懂", "AI_SUGGESTED"))}
        >
          查看新的目标建议
        </button>
      )}

      <details className="rounded-md border border-neutral-200 px-3 py-2" open={advancedDefaultOpen}>
        <summary className="cursor-pointer text-sm font-medium">更多设置</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">你在哪个行业？</span>
            <Input
              id="industry"
              value={form.industry}
              maxLength={POSITIONING_INPUT_LIMITS.industry}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.industry)}
              onChange={(event) => patch({ industry: event.target.value })}
            />
            {errors.industry ? <p className="mt-1 text-sm text-red-600">{errors.industry}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">主要发在哪个平台？</span>
            <Input
              id="platform"
              value={form.platform}
              maxLength={POSITIONING_INPUT_LIMITS.platform}
              required
              disabled={pending}
              onChange={(event) => patch({ platform: event.target.value })}
            />
            {errors.platform ? <p className="mt-1 text-sm text-red-600">{errors.platform}</p> : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">还有什么特殊要求？（选填）</span>
            <Textarea
              id="additionalInfo"
              value={form.additionalInfo}
              maxLength={POSITIONING_INPUT_LIMITS.additionalInfo}
              disabled={pending}
              onChange={(event) => patch({ additionalInfo: event.target.value })}
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? "生成中…" : "生成账号定位"}
        </Button>
        <Button variant="secondary" type="button" disabled={pending} onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
