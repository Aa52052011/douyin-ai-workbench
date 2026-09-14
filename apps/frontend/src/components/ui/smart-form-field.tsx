"use client";

import type { ReactNode } from "react";
import { FormField } from "./form-field";
import type { FieldControllerStateV1 } from "../../lib/ux/field-source";
import { sourceHint } from "../../lib/ux/field-source";

export function SmartFormField({
  label,
  htmlFor,
  optional,
  required,
  helper,
  error,
  state,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  required?: boolean;
  helper?: string;
  error?: string;
  state?: FieldControllerStateV1<unknown>;
  children: ReactNode;
}) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      optional={optional}
      required={required}
      helper={helper}
      error={error}
      sourceHint={state ? sourceHint(state.source) : null}
    >
      {children}
    </FormField>
  );
}
