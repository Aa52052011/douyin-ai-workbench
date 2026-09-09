import { StringListEditor } from "../string-list-editor";
import {
  PRODUCT_BRIEF_LIMITS,
  PRODUCT_INTAKE_COMPLETENESS_ITEMS,
  PRODUCT_INTAKE_SUMMARY_FIELDS,
  formatMissingFieldsHint,
} from "../../lib/product-intake";
import type {
  ProductIntakeDraft,
  ProductIntakeFieldKey,
  ProductIntakeReadiness,
} from "../../lib/product-intake.types";

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export function ProductIntakeDraftPanel({
  draft,
  readiness,
  pending,
  onChange,
  onConfirm,
}: {
  draft: ProductIntakeDraft;
  readiness: ProductIntakeReadiness;
  pending?: boolean;
  onChange: (field: ProductIntakeFieldKey, value: string | string[]) => void;
  onConfirm: () => void;
}) {
  const missingHint = formatMissingFieldsHint(readiness.missingLabels);
  const remaining = readiness.missingLabels.length;

  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-medium">AI 已整理 / 你可以直接修改</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          右侧修改可选。优先通过左侧对话补齐确认所需信息；确认前不会写入正式产品信息。
        </p>
      </div>

      <div className="border-b border-neutral-100 px-4 py-3">
        <p className="mb-2 text-xs font-medium text-neutral-700">当前信息完整度</p>
        <ul className="space-y-1 text-xs text-neutral-600">
          {PRODUCT_INTAKE_COMPLETENESS_ITEMS.map((item) => {
            const done = item.isComplete(draft);
            return (
              <li key={item.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={done ? "text-emerald-700" : "text-neutral-400"}>
                  {done ? "✓" : "○"}
                </span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
        {!readiness.readyForConfirmation && remaining > 0 ? (
          <p className="mt-2 text-xs text-neutral-600" id="product-intake-missing-hint">
            和 AI 补充剩余 {remaining} 项
            {missingHint ? `（${readiness.missingLabels.join("、")}）` : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-700">信息已基本齐全，可以确认产品信息。</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {PRODUCT_INTAKE_SUMMARY_FIELDS.map((field) => {
          if (field.kind === "list") {
            const items = (draft[field.key] as string[] | undefined) ?? [];
            const maxItems =
              field.key === "seedKeywords"
                ? PRODUCT_BRIEF_LIMITS.seedKeywords
                : field.key === "constraints"
                  ? PRODUCT_BRIEF_LIMITS.constraints
                  : PRODUCT_BRIEF_LIMITS.sellingPoints;
            const maxItemLength =
              field.key === "seedKeywords"
                ? PRODUCT_BRIEF_LIMITS.seedKeyword
                : field.key === "constraints"
                  ? PRODUCT_BRIEF_LIMITS.constraint
                  : PRODUCT_BRIEF_LIMITS.sellingPoint;
            return (
              <StringListEditor
                key={field.key}
                id={`intake-${field.key}`}
                label={field.label}
                items={items}
                maxItems={maxItems}
                maxItemLength={maxItemLength}
                disabled={pending}
                onChange={(next) => onChange(field.key, next)}
              />
            );
          }

          const value = (draft[field.key] as string | undefined) ?? "";
          const maxLength =
            field.key === "productName"
              ? PRODUCT_BRIEF_LIMITS.productName
              : field.key === "industry"
                ? PRODUCT_BRIEF_LIMITS.industry
                : field.key === "businessGoal"
                  ? PRODUCT_BRIEF_LIMITS.businessGoal
                  : field.key === "targetAudience"
                    ? PRODUCT_BRIEF_LIMITS.targetAudience
                    : field.key === "description" || field.key === "usageScenario"
                      ? PRODUCT_BRIEF_LIMITS.description
                      : PRODUCT_BRIEF_LIMITS.sellingPoint;

          return (
            <div key={field.key} className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor={`intake-${field.key}`}>
                {field.label}
              </label>
              {field.kind === "textarea" ? (
                <textarea
                  id={`intake-${field.key}`}
                  className={`${inputClass} min-h-20`}
                  value={value}
                  maxLength={maxLength}
                  disabled={pending}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              ) : (
                <input
                  id={`intake-${field.key}`}
                  className={inputClass}
                  value={value}
                  maxLength={maxLength}
                  disabled={pending}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-200 px-4 py-3">
        {!readiness.readyForConfirmation ? (
          <p className="mb-2 text-sm text-neutral-600">请继续在左侧对话补充，再确认。</p>
        ) : (
          <p className="mb-2 text-sm text-emerald-700">可以确认产品信息。</p>
        )}
        <button
          className="w-full rounded-md bg-neutral-950 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={pending || !readiness.readyForConfirmation}
          aria-describedby={!readiness.readyForConfirmation ? "product-intake-missing-hint" : undefined}
          onClick={onConfirm}
        >
          {pending ? "正在保存产品信息…" : "确认产品信息"}
        </button>
      </div>
    </aside>
  );
}
