import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UX_GLOBAL_PRINCIPLES_V1, UX_PRINCIPLE_COUNT } from "./principles";
import { DESIGN_TOKEN_NAMES, SPACING_SCALE } from "./tokens";
import { applyUserEdit, createFieldState, receiveExternalValue, sourceHint } from "./field-source";
import { looksLikeRawTechnicalError, toProductError } from "./product-error";
import { AI_TASK_STATES } from "./ai-task";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  assert.equal(UX_PRINCIPLE_COUNT, 14);
  assert.equal(UX_GLOBAL_PRINCIPLES_V1.every((item) => item.status === "ACTIVE"), true);
  assert.ok(DESIGN_TOKEN_NAMES.includes("color"));
  assert.equal(SPACING_SCALE[0], 4);
  const edited = applyUserEdit(createFieldState("A", "AI_PREFILLED"), "B");
  assert.equal(edited.value, "B");
  assert.equal(receiveExternalValue(edited, "C", "AI_SUGGESTED").value, "B");
  assert.equal(sourceHint("REUSED_FROM_CONTEXT"), "已根据账号定位填写");
  assert.equal(looksLikeRawTechnicalError("ECONNREFUSED"), true);
  assert.equal(toProductError(new Error("ECONNREFUSED"), "失败").technicalDetails?.includes("ECONNREFUSED"), true);
  assert.ok(AI_TASK_STATES.includes("RUNNING"));
  assert.match(read("src/components/ui/smart-form-field.tsx"), /SmartFormField/);
  assert.match(read("src/app/dashboard/settings/page.tsx"), /CapabilityStatus/);
  console.log("ux-wave1 selfcheck PASS");
}

run();
