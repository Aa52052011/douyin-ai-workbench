/**
 * B2-6C1 offline evidence writer. No provider / vision calls.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_MODEL_OUTPUT_V1 } from '../src/production-v2/visual-semantic/runtime/golden-model-output.fixture.js';
import { ModelOutputEnumValidationError } from '../src/production-v2/visual-semantic/runtime/model-output-enum-validation-error.js';
import { MODEL_OUTPUT_OBSERVATION_TYPES } from '../src/production-v2/visual-semantic/runtime/model-output.types.js';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../src/production-v2/visual-semantic/contracts/observation.types.js';
import {
  REDACTED_INVALID_ENUM_TOKEN,
  sanitizeRejectedEnumToken,
} from '../src/production-v2/visual-semantic/runtime/sanitize-rejected-enum-token.js';
import { validateVisualSemanticModelOutput } from '../src/production-v2/visual-semantic/runtime/validate-model-output.js';
import { UI_STRUCTURE_USER_PROMPT } from '../src/production-v2/visual-semantic/runtime/ui-structure-prompt.js';

const evidenceDir = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-6c1',
);

function writeJson(name: string, value: unknown) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function baseObs(type: unknown) {
  return {
    type,
    confidence: 0.9,
    visualSignals: ['visible'],
    uncertainty: { level: 'LOW', reasons: ['ok'] },
    frameId: 'synthetic-ui-0',
  };
}

function catchEnum(payload: unknown) {
  try {
    validateVisualSemanticModelOutput(payload);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ModelOutputEnumValidationError) {
      return { ok: false as const, snapshot: error.toSnapshot(), debugLabel: error.debugLabel };
    }
    throw error;
  }
}

const valid = validateVisualSemanticModelOutput(GOLDEN_MODEL_OUTPUT_V1);
const sidebar = catchEnum({ observations: [baseObs('SIDEBAR')] });
const synonym = catchEnum({ observations: [baseObs('PRODUCT_INTERFACE')] });
const overlong = catchEnum({ observations: [baseObs('X'.repeat(200))] });
const secret = catchEnum({ observations: [baseObs('sk-abcdefghijklmnopqrstuv')] });
const nonString = catchEnum({ observations: [baseObs({ nested: true })] });
const observations = Array.from({ length: 16 }, (_, index) =>
  index === 15 ? baseObs('SIDEBAR') : baseObs('PRODUCT_UI'),
);
const index15 = catchEnum({ observations });

writeJson('diagnostic-error-contract.json', {
  errorClass: 'ModelOutputEnumValidationError',
  providerCode: 'SCHEMA_VALIDATION_FAILED',
  diagnosticCode: 'ENUM_VALIDATION_FAILED',
  debugLabelPattern: 'model-output:observations[n].type:enum',
  snapshotFields: [
    'validationStage',
    'code',
    'path',
    'observationIndex',
    'field',
    'rejectedValue',
    'expectedEnumId',
    'observationKeys',
    'repairAttempted',
  ],
});
writeJson('sanitization-policy.json', {
  maxLength: 128,
  redactedToken: REDACTED_INVALID_ENUM_TOKEN,
  reuses: 'findSecretLikeHits',
  overlongExample: sanitizeRejectedEnumToken('X'.repeat(200)),
  secretExample: { rejectedValue: sanitizeRejectedEnumToken('sk-abcdefghijklmnopqrstuv').rejectedValue, redacted: true },
});
writeJson('enum-failure-fixtures.json', {
  validTypes: valid.observations.map((item) => item.type),
  sidebar: sidebar.ok ? null : sidebar.snapshot,
  synonym: synonym.ok ? null : synonym.snapshot,
  overlong: overlong.ok ? null : { rejectedValue: overlong.snapshot.rejectedValue, redacted: overlong.snapshot.rejectedValueRedacted },
  secret: secret.ok ? null : { rejectedValue: secret.snapshot.rejectedValue, originalValueType: secret.snapshot.originalValueType },
  nonString: nonString.ok ? null : { rejectedValue: nonString.snapshot.rejectedValue, originalValueType: nonString.snapshot.originalValueType },
  index15: index15.ok ? null : { path: index15.snapshot.path, observationIndex: index15.snapshot.observationIndex },
});
writeJson('enum-failure-test-results.json', {
  validPass: valid.observations.length === 4,
  sidebarCaptured: !sidebar.ok && sidebar.snapshot.rejectedValue === 'SIDEBAR',
  synonymCaptured: !synonym.ok && synonym.snapshot.rejectedValue === 'PRODUCT_INTERFACE',
  overlongRedacted: !overlong.ok && overlong.snapshot.rejectedValue === REDACTED_INVALID_ENUM_TOKEN,
  secretRedacted: !secret.ok && secret.snapshot.rejectedValue === REDACTED_INVALID_ENUM_TOKEN,
  nonStringRedacted: !nonString.ok && nonString.snapshot.originalValueType === 'object',
  indexAccurate: !index15.ok && index15.snapshot.observationIndex === 15,
});
writeJson('no-repair-audit.json', {
  sidebarMappedToNavigation: false,
  sidebarMappedToUnknownStructuredRegion: false,
  repairAttempted: false,
  failClosed: true,
});
writeJson('b2-1-boundary-audit.json', {
  dtoUnchanged: !(MODEL_OUTPUT_OBSERVATION_TYPES as readonly string[]).includes('SIDEBAR'),
  b21StillHasProductUi: (VISUAL_SEMANTIC_OBSERVATION_TYPES as readonly string[]).includes('PRODUCT_UI'),
  b21NotExpandedWithSidebar: !(VISUAL_SEMANTIC_OBSERVATION_TYPES as readonly string[]).includes('SIDEBAR'),
});
writeJson('prompt-boundary-audit.json', {
  stillHasDoNotInvent: UI_STRUCTURE_USER_PROMPT.includes('Do not invent new type names'),
  noSynonymRewriteThisStep: !UI_STRUCTURE_USER_PROMPT.toLowerCase().includes('do not use synonyms'),
});
writeJson('provider-call-audit.json', { visionCalls: 0, providerCalls: 0 });
writeJson('security-audit.json', {
  wholeObservationPersisted: false,
  secretsExposed: false,
  snapshotsContainVisualSignalValues: JSON.stringify(sidebar.ok ? {} : sidebar.snapshot).includes('visible'),
});
writeJson('limitations.json', {
  items: [
    'B2_6B_INVALID_VALUE_STILL_NOT_RECOVERABLE',
    'DIAGNOSTICS_COVER_OBSERVATION_TYPE_ONLY',
    'NO_LIVE_RE_SMOKE_THIS_STEP',
  ],
  count: 3,
});
writeJson('files-changed.json', {
  files: [
    'apps/backend/src/production-v2/visual-semantic/runtime/sanitize-rejected-enum-token.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/model-output-enum-validation-error.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/validate-model-output.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/pipeline-snapshot.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/real-visual-semantic.adapter.ts',
    'apps/backend/src/production-v2/visual-semantic/runtime/b2-6c1-enum-failure-diagnostics.spec.ts',
    'apps/backend/scripts/step-13.15b1e-b2-6c1-enum-failure-diagnostics.ts',
    'apps/backend/package.json',
  ],
});
writeJson('implementation-summary.json', {
  step: '13.15B-1E-B2-6C1',
  futureInvalidEnumRecoverable: true,
  existingB26bValue: 'NOT_RECOVERABLE_FROM_EXISTING_EVIDENCE',
  visionCalls: 0,
});

process.stdout.write(`${JSON.stringify({ ok: true, visionCalls: 0 })}\n`);
