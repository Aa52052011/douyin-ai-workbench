import type { ContentPlanRecord, ContentTopicRecord } from "../lib/content-planning.types";
import { SCRIPT_REQUIREMENTS_MAX, SCRIPT_TARGET_DURATIONS, type ScriptFormState } from "../lib/script.types";
import { planOptionLabel, topicOptionLabel, topicSelectorGroups } from "../lib/script.view";

export function ScriptSourceForm({
  form,
  plans,
  selectedPlan,
  topics,
  pending,
  onChange,
  collapsedByDefault = false,
}: {
  form: ScriptFormState;
  plans: ContentPlanRecord[];
  selectedPlan: ContentPlanRecord | null;
  topics: ContentTopicRecord[];
  pending: boolean;
  onChange: (next: ScriptFormState) => void;
  collapsedByDefault?: boolean;
}) {
  const groups = topicSelectorGroups(selectedPlan);
  const body = (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="script-plan">
          内容计划
        </label>
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
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="script-topic">
          选题
        </label>
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
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="script-duration">
          目标时长
        </label>
        <select
          id="script-duration"
          className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={form.targetDuration}
          disabled={pending}
          onChange={(event) => onChange({ ...form, targetDuration: Number(event.target.value) })}
        >
          {SCRIPT_TARGET_DURATIONS.map((item) => (
            <option key={item} value={item}>
              {item} 秒
            </option>
          ))}
        </select>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">补充要求（可选）</span>
        <textarea
          id="script-requirements"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={3}
          maxLength={SCRIPT_REQUIREMENTS_MAX}
          disabled={pending}
          value={form.requirements}
          onChange={(event) => onChange({ ...form, requirements: event.target.value })}
        />
      </label>
    </div>
  );

  if (collapsedByDefault) {
    return (
      <details className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-800">切换内容计划 / 选题</summary>
        <div className="mt-4">{body}</div>
      </details>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium">来源选题</h2>
      {body}
    </div>
  );
}
