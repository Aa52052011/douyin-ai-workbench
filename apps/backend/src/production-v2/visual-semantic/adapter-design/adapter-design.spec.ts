import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModelMessage } from '../../../agents/models/model.types.js';
import { CANDIDATE_MODEL_MATRIX, OCR_MVP_DECISION, VISION_PROVIDER_SELECTION_DECISION } from './selection-decision.js';
import { COORDINATE_TRANSPORT, CONTENT_REJECTION_POLICY, SCHEMA_REPAIR_POLICY } from './real-adapter.types.js';
import { LOCAL_REF_HANDOFF } from './multimodal-transport.types.js';
import { FUTURE_VISION_ENV_KEYS, VISION_TIMEOUT_RECOMMENDATION } from './prompt-modules.js';
import { PROMPT_FORBIDDEN, REAL_ADAPTER_IMPLEMENTATION_PLAN, SYNTHETIC_VISION_FIXTURES } from './validation-ladder.js';

describe('B2-3 vision adapter design', () => {
  it('keeps text ModelMessage as string content', () => {
    const message: ModelMessage = { role: 'user', content: 'text-only' };
    expect(typeof message.content).toBe('string');
  });

  it('does not claim current model vision is confirmed', () => {
    expect(VISION_PROVIDER_SELECTION_DECISION.status).toBe('BLOCKED_BY_CAPABILITY_UNKNOWN');
    expect(VISION_PROVIDER_SELECTION_DECISION.primaryCandidate).toBe('UNVALIDATED');
    expect(VISION_PROVIDER_SELECTION_DECISION.backupCandidate).toBe('UNVALIDATED');
    expect(CANDIDATE_MODEL_MATRIX.every((row) => row.multimodal !== 'CONFIRMED')).toBe(true);
    expect(CANDIDATE_MODEL_MATRIX[0]?.transportFit).toBe('CONFIRMED');
  });

  it('separates OCR and native text, and forbids decision leakage in prompt skeleton', () => {
    expect(OCR_MVP_DECISION.dedicatedOcr).toBe('NOT_REQUIRED_YET');
    expect(PROMPT_FORBIDDEN.some((line) => line.includes('DO_NOT_USE') || line.includes('final crop'))).toBe(true);
    expect(SYNTHETIC_VISION_FIXTURES).toContain('ambiguous_top_strip');
    expect(REAL_ADAPTER_IMPLEMENTATION_PLAN).toHaveLength(8);
  });

  it('freezes repair/coordinate/local-ref/content-rejection policies', () => {
    expect(SCHEMA_REPAIR_POLICY.maxAttempts).toBe(1);
    expect(SCHEMA_REPAIR_POLICY.forbid).toContain('invent_observation');
    expect(COORDINATE_TRANSPORT.invalid).toBe('REJECT_NO_SILENT_CLAMP');
    expect(LOCAL_REF_HANDOFF.forbidden).toContain('WINDOWS_PATH');
    expect(CONTENT_REJECTION_POLICY.failoverToBypassSafetyFilter).toBe(false);
    expect(VISION_TIMEOUT_RECOMMENDATION.totalCeilingMs).toBe(150_000);
    expect(FUTURE_VISION_ENV_KEYS).toContain('VISUAL_SEMANTIC_MODEL');
  });

  it('does not execute HTTP in adapter-design sources', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const rel of ['selection-decision.ts', 'real-adapter.types.ts', 'multimodal-transport.types.ts']) {
      const text = readFileSync(join(dir, rel), 'utf8');
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toMatch(/MODEL_API_KEY|Authorization|Bearer /);
    }
  });
});
