/**
 * B2-6C0 zero-inference enum contract diagnosis. No provider calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  B2_6B_SCHEMA_FAIL_PATH,
  B2_6C0_INVALID_INDEX,
  buildEnumContractDiagnosis,
  PRODUCT_UI_SYNONYM_CANDIDATES,
} from '../src/production-v2/visual-semantic/runtime/b2-6c0-enum-diagnosis.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const b26bDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-6b',
);
const evidenceDir = path.join(path.dirname(b26bDir), 'b2-6c0');

function writeJson(name: string, value: unknown) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readIfExists(rel: string): unknown | null {
  const full = path.join(b26bDir, rel);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, 'utf8'));
}

function searchRecoveredType(): { value: string | null; reasons: string[] } {
  const reasons: string[] = [];
  const candidates = [
    'call-a/sanitized-observations.json',
    'call-a/sanitized-model-output.json',
    'call-a/assistant-content.json',
    'call-a/assistant-raw.txt',
    'call-a/json.json',
  ];
  for (const rel of candidates) {
    if (!existsSync(path.join(b26bDir, rel))) {
      reasons.push(`missing:${rel}`);
    }
  }
  const modelSchema = readIfExists('call-a/model-schema-result.json') as { errorPaths?: string[] } | null;
  const paths = modelSchema?.errorPaths ?? [];
  reasons.push(`errorPaths:${JSON.stringify(paths)}`);
  if (!paths.includes(B2_6B_SCHEMA_FAIL_PATH)) {
    reasons.push('error-path-mismatch-or-missing');
  }
  reasons.push('asEnum-debugLabel-does-not-include-rejected-token');
  reasons.push('B2-6B-script-did-not-persist-pipeline.sanitizedModelOutput-on-schema-fail');
  reasons.push('assistant-content-body-not-saved-by-design');
  return { value: null, reasons };
}

const recovered = searchRecoveredType();
const diagnosis = buildEnumContractDiagnosis({ recoveredType: recovered.value, evidenceNotes: recovered.reasons });

writeJson('invalid-observation.json', {
  index: B2_6C0_INVALID_INDEX,
  failingPath: B2_6B_SCHEMA_FAIL_PATH,
  actualType: recovered.value,
  ActualInvalidEnumValue: recovered.value ?? 'NOT_RECOVERABLE_FROM_EXISTING_EVIDENCE',
  snapshot: null,
  recovery: recovered,
});
writeJson('prompt-enum.json', { types: diagnosis.promptTypes });
writeJson('model-dto-enum.json', { types: diagnosis.modelDtoTypes });
writeJson('b2-1-enum.json', { types: diagnosis.b21Types });
writeJson('enum-diff.json', {
  promptVsDto: diagnosis.promptVsDto,
  dtoVsB21: diagnosis.dtoVsB21,
  promptEnumDrift: diagnosis.promptEnumDrift,
  modelDtoInternalDrift: diagnosis.modelDtoInternalDrift,
});
writeJson('failure-classification.json', {
  classification: diagnosis.failureClassification,
  promptAllowsInvalid: diagnosis.promptAllowsInvalid,
  dtoAllowsInvalid: diagnosis.dtoAllowsInvalid,
  b21AllowsInvalid: diagnosis.b21AllowsInvalid,
  exactEnumInstruction: diagnosis.exactEnumInstruction,
  enumSourceDuplication: diagnosis.enumSourceDuplication,
  productUiSynonymsInPromptEnum: diagnosis.productUiSynonymsInPromptEnum,
  productUiDefinitionPresent: diagnosis.productUiDefinitionPresent,
  synonymCandidatesChecked: PRODUCT_UI_SYNONYM_CANDIDATES,
});
writeJson('proposed-minimal-fix.json', {
  ProposedMinimalFix:
    'Do not expand or alias enums. First persist sanitized observation.type (and rejected token in debugLabel) on model-facing schema fail, then re-diagnose the exact string. Prompt and DTO lists currently match; exact-enum instruction is only PARTIAL (list + do-not-invent, no no-synonym/exact-literal rule).',
});
writeJson('provider-call-audit.json', {
  visionCalls: 0,
  providerCalls: 0,
  retry: false,
  backup: false,
});
writeJson('files-changed.json', {
  productionBehavior: 0,
  files: [
    'apps/backend/src/production-v2/visual-semantic/runtime/b2-6c0-enum-diagnosis.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/b2-6c0-enum-diagnosis.spec.ts',
    'apps/backend/scripts/step-13.15b1e-b2-6c0-enum-diagnosis.ts',
    'apps/backend/package.json',
  ],
});
writeJson('diagnosis-summary.json', {
  ActualInvalidEnumValue: recovered.value ?? 'NOT_RECOVERABLE_FROM_EXISTING_EVIDENCE',
  PromptEnumDrift: diagnosis.promptEnumDrift,
  ModelDtoInternalDrift: diagnosis.modelDtoInternalDrift,
  ExactEnumInstruction: diagnosis.exactEnumInstruction,
  EnumSourceDuplication: diagnosis.enumSourceDuplication,
  FailureClassification: diagnosis.failureClassification,
  visionCalls: 0,
});

process.stdout.write(
  `${JSON.stringify({
    ActualInvalidEnumValue: recovered.value ?? 'NOT_RECOVERABLE_FROM_EXISTING_EVIDENCE',
    FailureClassification: diagnosis.failureClassification,
    PromptEnumDrift: diagnosis.promptEnumDrift,
    visionCalls: 0,
  })}\n`,
);
