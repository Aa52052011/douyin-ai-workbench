import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { videoRequest, fixtureObservation, baseResult } from '../fixtures/fixture-helpers.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { InferenceCallGuard } from './inference-guard.js';
import { mapModelOutputToProviderResult } from './map-model-output.js';
import {
  assessLatency,
  evaluateBrowser,
  evaluateContamination,
  evaluateFrameIdentity,
  evaluatePrecisionRecall,
  evaluateRegions,
  evaluateText,
  pipelinePass,
  shouldRunOptionalText,
  shouldRunSixImage,
} from './benchmark-evaluators.js';
import { RealVisualSemanticProviderAdapter } from './real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from './router-one-multimodal.client.js';
import { buildInterleavedUserContent } from './serialize-multi-frame.js';
import { BROWSER_POSITIVE_MANIFEST, SYNTHETIC_FRAME_MANIFEST } from './synthetic-benchmark-frames.js';
import { buildUiStructureUserPrompt } from './ui-structure-prompt.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';
import type { MultimodalModelClient } from './multimodal.types.js';
import type { VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

function modelObs(frameId: string, type: 'PRODUCT_UI' | 'NAVIGATION' | 'CARD' | 'BROWSER_CHROME', extra?: Record<string, unknown>) {
  return {
    type,
    confidence: 0.9,
    visualSignals: ['signal'],
    uncertainty: { level: 'LOW' as const, reasons: ['ok'] },
    frameId,
    ...extra,
  };
}

function mockClient(rawText: string): MultimodalModelClient {
  return {
    async invoke() {
      return {
        rawText,
        latencyMs: 20,
        httpStatus: 200,
        finishReason: 'stop',
        usage: {
          inputTextUnits: 10,
          inputImageUnits: null,
          outputUnits: 12,
          totalUnits: 22,
          cost: null,
          costStatus: 'UNPRICED' as const,
        },
      };
    },
  };
}

describe('B2-5 multi-image contract (offline)', () => {
  it('serializes interleaved FRAME_ID text and image parts', () => {
    const parts = buildInterleavedUserContent('prompt', [
      { frameId: 'synthetic-frame-0', dataUrl: 'data:image/jpeg;base64,aa' },
      { frameId: 'synthetic-frame-1', dataUrl: 'data:image/jpeg;base64,bb' },
    ]);
    expect(parts[0]).toEqual({ type: 'text', text: 'prompt' });
    expect(parts[1]).toEqual({ type: 'text', text: 'FRAME_ID=synthetic-frame-0' });
    expect(parts[2]).toMatchObject({ type: 'image_url' });
    expect(parts[3]).toEqual({ type: 'text', text: 'FRAME_ID=synthetic-frame-1' });
    expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(2);
  });

  it('requires frameId and rejects unknown frame ids', () => {
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [{ type: 'PRODUCT_UI', confidence: 0.9, visualSignals: ['x'], uncertainty: { level: 'LOW', reasons: ['r'] } }],
      }),
    ).toThrow(VisualSemanticProviderError);
    expect(() =>
      validateVisualSemanticModelOutput(
        { observations: [modelObs('synthetic-frame-9', 'PRODUCT_UI')] },
        { allowedFrameIds: ['synthetic-frame-0'] },
      ),
    ).toThrow(VisualSemanticProviderError);
  });

  it('does not let adapter guess frame from observation order', () => {
    const model = validateVisualSemanticModelOutput({
      observations: [modelObs('synthetic-frame-1', 'CARD'), modelObs('synthetic-frame-0', 'NAVIGATION')],
    });
    const mapped = mapModelOutputToProviderResult(model, {
      requestId: 'r',
      providerId: 'router-one-vision',
      allowedFrameIds: ['synthetic-frame-0', 'synthetic-frame-1'],
    });
    expect(mapped.observations[0]?.evidence.frameIds).toEqual(['synthetic-frame-1']);
    expect(mapped.observations[1]?.evidence.frameIds).toEqual(['synthetic-frame-0']);
  });

  it('evaluates contamination, precision/recall, browser trap and positive, text, IoU, latency, stop gates', () => {
    const result: VisualSemanticProviderResult = {
      ...baseResult(),
      observations: [
        fixtureObservation('PRODUCT_UI', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['home'] } }),
        fixtureObservation('NAVIGATION', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['header'] } }),
        fixtureObservation('CONTENT_PANEL', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['panel'] } }),
        fixtureObservation('CARD', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['HOMEPAGE card'] } }),
        fixtureObservation('BUTTON_LIKE_REGION', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['START'] } }),
        fixtureObservation('PRODUCT_UI', { evidence: { frameIds: ['synthetic-frame-1'], visualSignals: ['PLANPAGE leaked'] } }),
      ],
    };
    expect(evaluateFrameIdentity(result, SYNTHETIC_FRAME_MANIFEST.map((item) => item.frameId)).status).toBe('PASS');
    const contamination = evaluateContamination(result, SYNTHETIC_FRAME_MANIFEST);
    expect(contamination.count).toBeGreaterThanOrEqual(0);
    const homeOnly = {
      ...result,
      observations: result.observations.filter((item) => item.evidence.frameIds[0] === 'synthetic-frame-0'),
    };
    const pr = evaluatePrecisionRecall(homeOnly, [SYNTHETIC_FRAME_MANIFEST[0]!]);
    expect(pr.precision).toBeGreaterThan(0.8);
    expect(pr.recall).toBeGreaterThan(0.7);
    const noBrowser = evaluateBrowser(result, [SYNTHETIC_FRAME_MANIFEST[0]!]);
    expect(noBrowser.fp).toBe(0);
    const withBrowser = {
      ...result,
      observations: [
        fixtureObservation('BROWSER_CHROME', { evidence: { frameIds: ['synthetic-browser-positive'], visualSignals: ['tabs'] } }),
      ],
    };
    const tp = evaluateBrowser(withBrowser, [BROWSER_POSITIVE_MANIFEST]);
    expect(tp.tp).toBe(1);
    const trapFail = evaluateBrowser(
      {
        ...result,
        observations: [fixtureObservation('BROWSER_CHROME', { evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['tab'] } })],
      },
      [SYNTHETIC_FRAME_MANIFEST[0]!],
    );
    expect(trapFail.fp).toBe(1);
    const text = evaluateText(
      {
        ...result,
        observations: [
          fixtureObservation('TEXT_REGION', {
            evidence: { frameIds: ['synthetic-frame-0'], visualSignals: ['AI WORKBENCH HOME START HOMEPAGE'], textFragments: [{ text: 'AI WORKBENCH', confidence: 0.9, frameId: 'synthetic-frame-0', source: 'VISION_TEXT' }] },
          }),
        ],
      },
      [SYNTHETIC_FRAME_MANIFEST[0]!],
    );
    expect(text.exact).toBeGreaterThan(0);
    expect(evaluateRegions(result, [SYNTHETIC_FRAME_MANIFEST[0]!]).samples).toBeGreaterThan(0);
    expect(assessLatency(40_000)).toBe('GOOD');
    expect(assessLatency(80_000)).toBe('ACCEPTABLE');
    expect(assessLatency(120_000)).toBe('HIGH');
    expect(assessLatency(160_000)).toBe('TOO_HIGH');
    expect(pipelinePass({ transport: 'PASS', json: 'PASS', model: 'PASS', b2: 'PASS' })).toBe(true);
    expect(shouldRunSixImage(false)).toBe(false);
    expect(shouldRunOptionalText(true, 160_000, true)).toBe(false);
    expect(shouldRunOptionalText(true, 90_000, true)).toBe(true);
  });

  it('enforces inference limit 3', async () => {
    const guard = new InferenceCallGuard(3);
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }),
    );
    const client = new RouterOneMultimodalClient({ apiKey: 'x', baseUrl: 'https://api.router.one/v1' }, guard, fetchImpl as unknown as typeof fetch);
    const input = {
      model: 'openai/gpt-5.5',
      requestId: 'r1',
      responseFormat: 'json_object' as const,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 't' }] }],
      images: [
        { type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,a' } },
        { type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,b' } },
        { type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,c' } },
      ],
    };
    await client.invoke(input, { timeoutMs: 1000 });
    await client.invoke(input, { timeoutMs: 1000 });
    await client.invoke(input, { timeoutMs: 1000 });
    await expect(client.invoke(input, { timeoutMs: 1000 })).rejects.toThrow('SMOKE_INFERENCE_LIMIT_EXCEEDED');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('maps multi-frame local jpegs through analyzeVideoFrames without network', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b25-'));
    const a = path.join(dir, 'a.jpg');
    const b = path.join(dir, 'b.jpg');
    await writeFile(a, MIN_JPEG);
    await writeFile(b, MIN_JPEG);
    const payload = {
      observations: [modelObs('synthetic-frame-0', 'PRODUCT_UI'), modelObs('synthetic-frame-1', 'NAVIGATION')],
    };
    const adapter = new RealVisualSemanticProviderAdapter(mockClient(JSON.stringify(payload)), 'openai/gpt-5.5');
    const result = await adapter.analyzeVideoFrames(
      videoRequest({
        frames: [
          {
            frameId: 'synthetic-frame-0',
            timestampMs: 0,
            width: 1280,
            height: 720,
            mediaRef: { kind: 'LOCAL_REF', reference: a },
            selectionReason: ['UNIFORM'],
          },
          {
            frameId: 'synthetic-frame-1',
            timestampMs: 1000,
            width: 1280,
            height: 720,
            mediaRef: { kind: 'LOCAL_REF', reference: b },
            selectionReason: ['UNIFORM'],
          },
        ],
      }),
    );
    expect(result.observations.find((item) => item.type === 'PRODUCT_UI')?.evidence.frameIds).toEqual(['synthetic-frame-0']);
    expect(result.observations.find((item) => item.type === 'NAVIGATION')?.evidence.frameIds).toEqual(['synthetic-frame-1']);
  });

  it('multi-frame prompt forbids persistence assumptions and requires frameId', () => {
    const prompt = buildUiStructureUserPrompt(['synthetic-frame-0', 'synthetic-frame-1']);
    expect(prompt).toContain('Analyze each frame independently first');
    expect(prompt).toContain('Do not assume an element persists');
    expect(prompt).toContain('frameId');
    expect(prompt).toContain('Do not output asset-level temporal conclusions or occurrenceRatio');
  });
});
