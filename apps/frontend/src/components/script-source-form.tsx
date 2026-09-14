import type { ContentPlanRecord, ContentTopicRecord } from "../lib/content-planning.types";
import { SCRIPT_REQUIREMENTS_MAX, SCRIPT_TARGET_DURATIONS, type ScriptFormState } from "../lib/script.types";
import { planOptionLabel, topicOptionLabel, topicSelectorGroups } from "../lib/script.view";
import { SmartChoiceGroup } from "./ui/smart-choice-group";
import { SmartFormField } from "./ui/smart-form-field";
import { createFieldState } from "../lib/ux/field-source";
import { Textarea } from "./ui/input";

export function ScriptSourceForm({
  form,
  plans,
  selectedPlan,
  topics,
  pending,
  onChange,
  collapsedByDefault = false,
  contextLine,
}: {
  form: ScriptFormState;
  plans: ContentPlanRecord[];
  selectedPlan: ContentPlanRecord | null;
  topics: ContentTopicRecord[];
  pending: boolean;
  onChange: (next: ScriptFormState) => void;
  collapsedByDefault?: boolean;
  contextLine?: string;
}) {
  const groups = topicSelectorGroups(selectedPlan);
  const durationState = createFieldState(String(form.targetDuration), "REUSED_FROM_CONTEXT");
  const body = (
    <div className="space-y-4">
      {contextLine ? (
        <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700" data-acf-script-context-reuse>
          {contextLine}
        </p>
      ) : null}
      <SmartFormField label="这条视频大概多长？" htmlFor="script-duration" state={durationState}>
        <SmartChoiceGroup
          name="script-duration"
          selected={String(form.targetDuration)}
          onSelect={(value) => onChange({ ...form, targetDuration: Number(value) })}
          options={SCRIPT_TARGET_DURATIONS.map((item) => ({
            value: String(item),
            label: `${item} 秒`,
            recommended: item === 30,
          }))}
        />
      </SmartFormField>
      <SmartFormField
        label="这次有什么特殊要求？（选填）"
        htmlFor="script-requirements"
        optional
        helper="必须提到的卖点、不想出现的表达，都可以用自己的话写。"
        state={createFieldState(form.requirements, "USER_ENTERED")}
      >
        <Textarea
          id="script-requirements"
          rows={3}
          maxLength={SCRIPT_REQUIREMENTS_MAX}
          disabled={pending}
          value={form.requirements}
          onChange={(event) => onChange({ ...form, requirements: event.target.value })}
        />
      </SmartFormField>
      <details className="rounded-md border border-neutral-200 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">切换内容计划 / 更换选题</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">内容计划</span>
            <select
              id="script-plan"
              className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={form.contentPlanId}
              disabled={pending}
              onChange={(event) =>
                onChange({
                  ...form,
                  contentPlanId: event.target.value,
                  topicId: "",
                })
              }
            >
              <option value="">请选择内容计划</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {planOptionLabel(plan)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">选题</span>
            <select
              id="script-topic"
              className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={form.topicId}
              disabled={pending || !form.contentPlanId}
              onChange={(event) => onChange({ ...form, topicId: event.target.value })}
            >
              <option value="">请选择选题</option>
              {groups.length > 0
                ? groups.map((group) => (
                    <optgroup key={group.dayIndex} label={group.heading}>
                      {group.topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topicOptionLabel(topic)}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : topics.map((topic) =>
                    topic.id ? (
                      <option key={topic.id} value={topic.id}>
                        {topicOptionLabel(topic)}
                      </option>
                    ) : null,
                  )}
            </select>
          </label>
        </div>
      </details>
    </div>
  );

  if (collapsedByDefault) {
    return (
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        {body}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium">这条脚本特有的信息</h2>
      {body}
    </div>
  );
}
