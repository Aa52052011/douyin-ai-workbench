import type { ReactNode } from "react";
import {
  PRODUCT_BRIEF_FIELD_LABELS,
  PRODUCT_BRIEF_LIMITS,
} from "../lib/product-brief.types";
import type { ProductBriefFieldErrors, ProductBriefFormState } from "../lib/product-brief.form";
import { StringListEditor } from "./string-list-editor";

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium" htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export function ProductBriefForm({
  form,
  errors,
  pending,
  isNewVersion,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: ProductBriefFormState;
  errors: ProductBriefFieldErrors;
  pending: boolean;
  isNewVersion: boolean;
  onChange: (next: ProductBriefFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function set<K extends keyof ProductBriefFormState>(key: K, value: ProductBriefFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <form
      className="space-y-6 rounded-xl border border-neutral-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {isNewVersion ? (
        <p className="text-sm text-neutral-600">保存后会生成一个新的产品信息版本，历史版本会保留。</p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-medium">基本信息</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="productName" label={PRODUCT_BRIEF_FIELD_LABELS.productName} required error={errors.productName}>
            <input
              id="productName"
              className={inputClass}
              value={form.productName}
              maxLength={PRODUCT_BRIEF_LIMITS.productName}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.productName)}
              aria-describedby={errors.productName ? "productName-error" : undefined}
              onChange={(event) => set("productName", event.target.value)}
            />
          </Field>
          <Field id="brand" label={PRODUCT_BRIEF_FIELD_LABELS.brand} error={errors.brand}>
            <input
              id="brand"
              className={inputClass}
              value={form.brand}
              maxLength={PRODUCT_BRIEF_LIMITS.brand}
              disabled={pending}
              aria-invalid={Boolean(errors.brand)}
              aria-describedby={errors.brand ? "brand-error" : undefined}
              onChange={(event) => set("brand", event.target.value)}
            />
          </Field>
          <Field id="industry" label={PRODUCT_BRIEF_FIELD_LABELS.industry} required error={errors.industry}>
            <input
              id="industry"
              className={inputClass}
              value={form.industry}
              maxLength={PRODUCT_BRIEF_LIMITS.industry}
              required
              disabled={pending}
              aria-invalid={Boolean(errors.industry)}
              aria-describedby={errors.industry ? "industry-error" : undefined}
              onChange={(event) => set("industry", event.target.value)}
            />
          </Field>
          <Field id="category" label={PRODUCT_BRIEF_FIELD_LABELS.category} error={errors.category}>
            <input
              id="category"
              className={inputClass}
              value={form.category}
              maxLength={PRODUCT_BRIEF_LIMITS.category}
              disabled={pending}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? "category-error" : undefined}
              onChange={(event) => set("category", event.target.value)}
            />
          </Field>
        </div>
        <Field id="description" label={PRODUCT_BRIEF_FIELD_LABELS.description} error={errors.description}>
          <textarea
            id="description"
            className={`${inputClass} min-h-28`}
            value={form.description}
            maxLength={PRODUCT_BRIEF_LIMITS.description}
            disabled={pending}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? "description-error" : undefined}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">推广目标</h3>
        <Field id="businessGoal" label={PRODUCT_BRIEF_FIELD_LABELS.businessGoal} required error={errors.businessGoal}>
          <textarea
            id="businessGoal"
            className={`${inputClass} min-h-24`}
            value={form.businessGoal}
            maxLength={PRODUCT_BRIEF_LIMITS.businessGoal}
            required
            disabled={pending}
            aria-invalid={Boolean(errors.businessGoal)}
            aria-describedby={errors.businessGoal ? "businessGoal-error" : undefined}
            onChange={(event) => set("businessGoal", event.target.value)}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="conversionGoal" label={PRODUCT_BRIEF_FIELD_LABELS.conversionGoal} error={errors.conversionGoal}>
            <input
              id="conversionGoal"
              className={inputClass}
              value={form.conversionGoal}
              maxLength={PRODUCT_BRIEF_LIMITS.conversionGoal}
              disabled={pending}
              aria-invalid={Boolean(errors.conversionGoal)}
              aria-describedby={errors.conversionGoal ? "conversionGoal-error" : undefined}
              onChange={(event) => set("conversionGoal", event.target.value)}
            />
          </Field>
          <Field id="priceRange" label={PRODUCT_BRIEF_FIELD_LABELS.priceRange} error={errors.priceRange}>
            <input
              id="priceRange"
              className={inputClass}
              value={form.priceRange}
              maxLength={PRODUCT_BRIEF_LIMITS.priceRange}
              disabled={pending}
              aria-invalid={Boolean(errors.priceRange)}
              aria-describedby={errors.priceRange ? "priceRange-error" : undefined}
              onChange={(event) => set("priceRange", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">卖点与人群</h3>
        <StringListEditor
          id="sellingPoints"
          label={PRODUCT_BRIEF_FIELD_LABELS.sellingPoints}
          items={form.sellingPoints}
          maxItems={PRODUCT_BRIEF_LIMITS.sellingPoints}
          maxItemLength={PRODUCT_BRIEF_LIMITS.sellingPoint}
          error={errors.sellingPoints}
          disabled={pending}
          onChange={(items) => set("sellingPoints", items)}
        />
        <Field id="targetAudience" label={PRODUCT_BRIEF_FIELD_LABELS.targetAudience} error={errors.targetAudience}>
          <textarea
            id="targetAudience"
            className={`${inputClass} min-h-24`}
            value={form.targetAudience}
            maxLength={PRODUCT_BRIEF_LIMITS.targetAudience}
            disabled={pending}
            aria-invalid={Boolean(errors.targetAudience)}
            aria-describedby={errors.targetAudience ? "targetAudience-error" : undefined}
            onChange={(event) => set("targetAudience", event.target.value)}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">关键词与竞品</h3>
        <StringListEditor
          id="seedKeywords"
          label={PRODUCT_BRIEF_FIELD_LABELS.seedKeywords}
          items={form.seedKeywords}
          maxItems={PRODUCT_BRIEF_LIMITS.seedKeywords}
          maxItemLength={PRODUCT_BRIEF_LIMITS.seedKeyword}
          error={errors.seedKeywords}
          disabled={pending}
          onChange={(items) => set("seedKeywords", items)}
        />
        <StringListEditor
          id="referenceCompetitors"
          label={PRODUCT_BRIEF_FIELD_LABELS.referenceCompetitors}
          items={form.referenceCompetitors}
          maxItems={PRODUCT_BRIEF_LIMITS.referenceCompetitors}
          maxItemLength={PRODUCT_BRIEF_LIMITS.competitor}
          error={errors.referenceCompetitors}
          disabled={pending}
          onChange={(items) => set("referenceCompetitors", items)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">风格与限制</h3>
        <Field id="tone" label={PRODUCT_BRIEF_FIELD_LABELS.tone} error={errors.tone}>
          <input
            id="tone"
            className={inputClass}
            value={form.tone}
            maxLength={PRODUCT_BRIEF_LIMITS.tone}
            disabled={pending}
            aria-invalid={Boolean(errors.tone)}
            aria-describedby={errors.tone ? "tone-error" : undefined}
            onChange={(event) => set("tone", event.target.value)}
          />
        </Field>
        <StringListEditor
          id="constraints"
          label={PRODUCT_BRIEF_FIELD_LABELS.constraints}
          items={form.constraints}
          maxItems={PRODUCT_BRIEF_LIMITS.constraints}
          maxItemLength={PRODUCT_BRIEF_LIMITS.constraint}
          error={errors.constraints}
          disabled={pending}
          onChange={(items) => set("constraints", items)}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" disabled={pending} type="submit">
          {pending ? "保存中…" : "保存"}
        </button>
        <button className="rounded-md border px-4 py-2 text-sm" disabled={pending} type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}
