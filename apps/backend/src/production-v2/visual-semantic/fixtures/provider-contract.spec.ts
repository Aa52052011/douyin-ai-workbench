import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { MockVisualSemanticProvider } from '../provider/mock-visual-semantic.provider.js';
import { parseVisualSemanticAnalysisRequest } from '../schema/visual-semantic-request.schema.js';
import { parseVisualSemanticProviderResult } from '../schema/visual-semantic-response.schema.js';
import { normalizeVisualSemanticProviderResult } from '../normalization/normalize-semantic-result.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { imageRequest, videoRequest, fixtureObservation, baseResult } from './fixture-helpers.js';
import {
  ambiguousFixture,
  browserChromeFixture,
  developerArtifactFixture,
  partialFixture,
  privacyFixture,
  productHeaderTrapFixture,
  productUiFixture,
} from './provider-result.fixtures.js';
import { CONTENT_01_NEW_CONTRACT_FIXTURE, CONTENT_01_OLD_CONTRACT_FIXTURE } from './content01-contract.fixture.js';

function expectSchemaFail(raw: unknown): void {
  try {
    parseVisualSemanticProviderResult(raw);
    throw new Error('expected schema fail');
  } catch (error) {
    expect(error).toBeInstanceOf(VisualSemanticProviderError);
    expect((error as VisualSemanticProviderError).code).toBe('SCHEMA_VALIDATION_FAILED');
    expect((error as VisualSemanticProviderError).retryable).toBe(false);
  }
}

describe('B2-1 provider fixtures and schema', () => {
  it('accepts product UI fixture without browser chrome', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: productUiFixture() });
    const result = await provider.analyzeImage(imageRequest());
    expect(result.status).toBe('READY');
    expect(result.observations.map((o) => o.type)).toEqual(expect.arrayContaining(['PRODUCT_UI', 'NAVIGATION', 'TEXT_REGION']));
    expect(result.uiFocusCandidates?.[0]?.role).toBe('PRIMARY_CONTENT');
    expect(result.browserChromeObservations).toEqual([]);
  });

  it('accepts browser chrome fixture with address-bar signals', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: browserChromeFixture() }).analyzeImage(imageRequest());
    expect(result.observations.some((o) => o.type === 'BROWSER_CHROME')).toBe(true);
    expect(result.browserChromeObservations?.[0]?.signals).toEqual(expect.arrayContaining(['ADDRESS_BAR_LIKE', 'URL_LIKE_TEXT']));
  });

  it('does not force top product navigation to be browser chrome', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: productHeaderTrapFixture() }).analyzeImage(imageRequest());
    expect(result.observations.some((o) => o.type === 'NAVIGATION')).toBe(true);
    expect(result.observations.some((o) => o.type === 'BROWSER_CHROME')).toBe(false);
    expect(result.browserChromeObservations).toEqual([]);
  });

  it('accepts developer artifacts without STALE final', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: developerArtifactFixture() }).analyzeImage(imageRequest());
    expect(result.developerArtifactObservations?.map((d) => d.type)).toEqual(expect.arrayContaining(['LOCALHOST', 'DEV_LABEL', 'TERMINAL']));
    expect(result.authenticityObservations).toEqual([]);
  });

  it('accepts synthetic privacy observations', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: privacyFixture() }).analyzeImage(imageRequest());
    expect(result.privacyObservations?.map((p) => p.category)).toEqual(['EMAIL', 'TOKEN_LIKE']);
    expect(result.textEvidence?.some((t) => t.text === 'example@example.com')).toBe(true);
  });

  it('allows unknown structured region with high uncertainty', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: ambiguousFixture() }).analyzeImage(imageRequest());
    expect(result.observations[0]?.type).toBe('UNKNOWN_STRUCTURED_REGION');
    expect(result.observations[0]?.uncertainty.level).toBe('HIGH');
    expect(result.observations[0]?.observationState).toBe('UNCERTAIN');
  });

  it('keeps other observations when one module is PARTIAL', async () => {
    const result = await new MockVisualSemanticProvider({ mode: 'PARTIAL', fixture: partialFixture() }).analyzeImage(
      imageRequest({ taskModules: ['UI_STRUCTURE', 'PRIVACY'] }),
    );
    expect(result.status).toBe('PARTIAL');
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.warnings).toContain('MODULE_ANALYSIS_PARTIAL');
    expect(result.moduleResults?.some((m) => m.module === 'PRIVACY' && m.status === 'FAILED')).toBe(true);
  });

  it('rejects confidence outside 0-1', () => {
    const raw = productUiFixture();
    raw.observations[0].confidence = 1.5;
    expectSchemaFail(raw);
  });

  it('rejects invalid rect without clamping', () => {
    const raw = productUiFixture();
    raw.observations[0].region = { x: 0.5, y: 0, width: 0.6, height: 0.2 };
    expectSchemaFail(raw);
  });

  it('rejects missing evidence', () => {
    const raw = productUiFixture();
    raw.observations[0].evidence = { frameIds: [] };
    expectSchemaFail(raw);
  });

  it('rejects assetUsage decision leakage', () => {
    expectSchemaFail({ ...productUiFixture(), assetUsage: 'DO_NOT_USE' });
  });

  it('rejects bestCrop output', () => {
    expectSchemaFail({ ...productUiFixture(), bestCrop: { x: 0, y: 0, width: 1, height: 1 } });
  });

  it('rejects REAL/FAKE authenticity', () => {
    expectSchemaFail({
      ...productUiFixture(),
      authenticityObservations: [{ type: 'REAL', confidence: 0.9, evidence: { frameIds: ['f0'], visualSignals: ['x'] } }],
    });
  });

  it('rejects secret fields on request', () => {
    try {
      parseVisualSemanticAnalysisRequest({ ...imageRequest(), apiKey: 'secret' });
      throw new Error('expected fail');
    } catch (error) {
      expect(error).toBeInstanceOf(VisualSemanticProviderError);
      expect((error as VisualSemanticProviderError).code).toBe('INPUT_INVALID');
    }
  });

  it('rejects VIDEO on analyzeImage', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: productUiFixture() });
    await expect(provider.analyzeImage(videoRequest())).rejects.toMatchObject({ code: 'INPUT_INVALID' });
  });

  it('rejects IMAGE on analyzeVideoFrames', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: productUiFixture() });
    await expect(provider.analyzeVideoFrames(imageRequest())).rejects.toMatchObject({ code: 'INPUT_INVALID' });
  });

  it('guards multi-frame capability', async () => {
    const provider = new MockVisualSemanticProvider({
      mode: 'SUCCESS',
      fixture: productUiFixture(),
      capabilities: { multiFrameAnalysis: false },
    });
    await expect(provider.analyzeVideoFrames(videoRequest())).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  });

  it('marks TEXT_EVIDENCE module PARTIAL when OCR capability is false', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'SUCCESS', fixture: productUiFixture(), capabilities: { ocr: false } });
    const result = await provider.analyzeImage(imageRequest({ taskModules: ['UI_STRUCTURE', 'TEXT_EVIDENCE'] }));
    expect(result.status).toBe('PARTIAL');
    expect(result.moduleResults?.some((m) => m.module === 'TEXT_EVIDENCE' && m.status === 'FAILED')).toBe(true);
  });

  it('serializes request and result through JSON', () => {
    const request = parseVisualSemanticAnalysisRequest(JSON.parse(JSON.stringify(imageRequest())));
    const result = parseVisualSemanticProviderResult(JSON.parse(JSON.stringify(productUiFixture())));
    expect(request.schemaVersion).toBe('visual.semantic.provider-request:v1');
    expect(result.schemaVersion).toBe('visual.semantic.provider-result:v1');
  });

  it('normalizes deterministically', () => {
    const a = normalizeVisualSemanticProviderResult(productUiFixture());
    const b = normalizeVisualSemanticProviderResult(productUiFixture());
    expect(a.observations.map((o) => o.observationId)).toEqual(b.observations.map((o) => o.observationId));
    expect(JSON.stringify(a.observations)).toBe(JSON.stringify(b.observations));
  });

  it('dedupes same type overlapping observations', () => {
    const raw = baseResult({
      observations: [
        fixtureObservation('PRODUCT_UI', { region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }),
        fixtureObservation('PRODUCT_UI', { region: { x: 0.11, y: 0.11, width: 0.5, height: 0.5 }, confidence: 0.95 }),
      ],
    });
    const normalized = normalizeVisualSemanticProviderResult(raw);
    expect(normalized.observations.filter((o) => o.type === 'PRODUCT_UI')).toHaveLength(1);
  });

  it('does not merge overlapping different types', () => {
    const raw = baseResult({
      observations: [
        fixtureObservation('PRODUCT_UI', { region: { x: 0, y: 0, width: 0.5, height: 0.2 } }),
        fixtureObservation('BROWSER_CHROME', { region: { x: 0, y: 0, width: 0.5, height: 0.2 } }),
      ],
    });
    const normalized = normalizeVisualSemanticProviderResult(raw);
    expect(normalized.observations).toHaveLength(2);
  });

  it('simulates timeout without waiting', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'TIMEOUT', fixture: productUiFixture() });
    try {
      await provider.analyzeImage(imageRequest());
      throw new Error('expected timeout');
    } catch (error) {
      expect(error).toBeInstanceOf(VisualSemanticProviderError);
      const err = error as VisualSemanticProviderError;
      expect(err.code).toBe('PROVIDER_TIMEOUT');
      expect(err.retryable).toBe(true);
      expect(JSON.stringify(err.toJSON())).not.toMatch(/apiKey|stack|D:\\\\|prompt/i);
    }
  });

  it('fails without fake observations', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'FAIL' });
    await expect(provider.analyzeImage(imageRequest())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
  });

  it('rejects invalid schema without best-effort parse', async () => {
    const provider = new MockVisualSemanticProvider({ mode: 'INVALID_SCHEMA', fixture: productUiFixture() });
    await expect(provider.analyzeImage(imageRequest())).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION_FAILED', retryable: false });
  });

  it('represents Content #1 expected categories without claiming measured vision', () => {
    expect(CONTENT_01_NEW_CONTRACT_FIXTURE.kind).toBe('EXPECTED_CATEGORY_ONLY');
    expect(CONTENT_01_NEW_CONTRACT_FIXTURE.measuredVisionOutput).toBe(false);
    for (const type of CONTENT_01_NEW_CONTRACT_FIXTURE.representableAs) {
      expect(VISUAL_SEMANTIC_OBSERVATION_TYPES).toContain(type);
    }
    expect(CONTENT_01_OLD_CONTRACT_FIXTURE.authenticityCandidate).toBe('STALE_CANDIDATE');
    expect(CONTENT_01_OLD_CONTRACT_FIXTURE.forbids).toContain('DO_NOT_USE');
  });
});

describe('B2-1 wiring and source audit', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('does not call fetch/axios/openai in visual-semantic runtime', () => {
    const files = [
      'provider/mock-visual-semantic.provider.ts',
      'provider/visual-semantic-provider.ts',
      'schema/visual-semantic-response.schema.ts',
      'normalization/normalize-semantic-result.ts',
    ];
    for (const rel of files) {
      const text = readFileSync(join(root, rel), 'utf8');
      expect(text).not.toMatch(/\bfetch\s*\(/);
      expect(text).not.toMatch(/axios|openai|OpenAI|RouterOne|minimax/i);
      expect(text).not.toMatch(/tesseract|ffmpeg/i);
    }
  });

  it('is not imported by worker or video generation', () => {
    const backendSrc = join(root, '../../');
    const guarded = ['videos/video-generation.service.ts', 'jobs/job.processor.ts'];
    for (const rel of guarded) {
      const text = readFileSync(join(backendSrc, rel), 'utf8');
      expect(text).not.toContain('visual-semantic');
      expect(text).not.toContain('MockVisualSemanticProvider');
    }
  });
});
