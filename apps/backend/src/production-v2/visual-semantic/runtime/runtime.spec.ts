import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { imageRequest } from '../fixtures/fixture-helpers.js';
import { productUiFixture } from '../fixtures/provider-result.fixtures.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import { bytesToDataUrl, redactDataUrl } from './data-url.js';
import { InferenceCallGuard } from './inference-guard.js';
import { mapVisionHttpError } from './http-error-map.js';
import { serializeChatMessages, sanitizeRequestLog, stripSecrets } from './payload-redaction.js';
import { extractAssistantContent, parseJsonObjectWithOptionalFormatRepair } from './response-extract.js';
import { GOLDEN_MODEL_OUTPUT_V1 } from './golden-model-output.fixture.js';
import { RealVisualSemanticProviderAdapter } from './real-visual-semantic.adapter.js';
import { RouterOneMultimodalClient } from './router-one-multimodal.client.js';
import { assertNotDogfoodAsset, assertSmokeHasNoAssetIdArg } from './smoke-guards.js';
import { evaluateSyntheticGroundTruth } from './synthetic-ground-truth.js';
import { renderSyntheticProductUiPpm, SYNTHETIC_FIXTURE_HEIGHT, SYNTHETIC_FIXTURE_WIDTH } from './synthetic-product-ui-fixture.js';
import type { MultimodalInvokeResult, MultimodalModelClient } from './multimodal.types.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

function visionFixture() {
  const raw = productUiFixture();
  return {
    ...raw,
    providerId: 'router-one-vision',
    providerFamily: 'OPENAI_COMPATIBLE' as const,
    observations: raw.observations.map((item) => ({ ...item, source: 'VISION_PROVIDER' as const })),
    semanticRegions: raw.semanticRegions.map((item) => ({ ...item, source: 'VISION_PROVIDER' as const })),
  };
}

function mockClient(rawText: string, extra?: Partial<MultimodalInvokeResult>): MultimodalModelClient {
  return {
    async invoke() {
      return {
        rawText,
        latencyMs: 12,
        httpStatus: 200,
        finishReason: 'stop',
        usage: {
          inputTextUnits: 10,
          inputImageUnits: null,
          outputUnits: 20,
          totalUnits: 30,
          cost: null,
          costStatus: 'UNPRICED',
        },
        ...extra,
      };
    },
  };
}

describe('B2-4 multimodal runtime (offline)', () => {
  it('serializes text and image_url content parts', () => {
    const messages = serializeChatMessages(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: [{ type: 'text', text: 'look' }] },
      ],
      [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }],
    );
    const user = messages[1]?.content;
    expect(Array.isArray(user)).toBe(true);
    expect(user).toEqual(
      expect.arrayContaining([
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
      ]),
    );
  });

  it('builds DATA_URL without exposing it in redact helper', () => {
    const payload = bytesToDataUrl(MIN_JPEG, 'image/jpeg');
    expect(payload.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(payload.byteSize).toBe(MIN_JPEG.byteLength);
    expect(redactDataUrl(payload.dataUrl)).toContain('[redacted]');
    expect(redactDataUrl(payload.dataUrl)).not.toMatch(/[A-Za-z0-9+/=]{20,}/);
  });

  it('redacts request logs to allowed fields', () => {
    const log = sanitizeRequestLog({
      requestId: 'r1',
      model: 'openai/gpt-5.5',
      numberOfImages: 1,
      totalImageBytes: 100,
      timeoutMs: 90_000,
      responseFormat: 'json_object',
    });
    expect(Object.keys(log).sort()).toEqual(['model', 'numberOfImages', 'requestId', 'responseFormat', 'timeout', 'totalImageBytes']);
    expect(stripSecrets('Bearer sk-rk-abcdefghijk data:image/jpeg;base64,AAAA')).not.toContain('sk-rk');
  });

  it('enforces inference limit 1', async () => {
    const guard = new InferenceCallGuard(1);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }));
    const client = new RouterOneMultimodalClient({ apiKey: 'x', baseUrl: 'https://api.router.one/v1' }, guard, fetchImpl as unknown as typeof fetch);
    const input = {
      model: 'openai/gpt-5.5',
      requestId: 'r1',
      responseFormat: 'json_object' as const,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 't' }] }],
      images: [{ type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,a' } }],
    };
    await client.invoke(input, { timeoutMs: 1000 });
    await expect(client.invoke(input, { timeoutMs: 1000 })).rejects.toThrow('SMOKE_INFERENCE_LIMIT_EXCEEDED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps HTTP errors without leaking bodies', () => {
    expect(mapVisionHttpError(401, 'invalid api key').authPathFailed).toBe(true);
    expect(mapVisionHttpError(400, 'image_url is not supported').dataUrlUnsupported).toBe(true);
    expect(mapVisionHttpError(400, 'model does not support image input').modelVisionUnsupported).toBe(true);
    expect(mapVisionHttpError(429, 'rate').code).toBe('PROVIDER_UNAVAILABLE');
    expect(mapVisionHttpError(503, 'x').code).toBe('PROVIDER_UNAVAILABLE');
    expect(mapVisionHttpError(400, 'content policy violation').code).toBe('CONTENT_REJECTED');
  });

  it('extracts assistant JSON and format-repairs fences only', () => {
    expect(extractAssistantContent({ choices: [{ message: { content: '{"a":1}' } }] })).toBe('{"a":1}');
    const ok = parseJsonObjectWithOptionalFormatRepair('{"a":1}');
    expect(ok.rawSchemaPass).toBe(true);
    const repaired = parseJsonObjectWithOptionalFormatRepair('```json\n{"a":1}\n```');
    expect(repaired.repairUsed).toBe(true);
    expect(repaired.value).toEqual({ a: 1 });
  });

  it('guards modules, context, and video', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b24-'));
    const jpegPath = path.join(dir, 'x.jpg');
    await writeFile(jpegPath, MIN_JPEG);
    const adapter = new RealVisualSemanticProviderAdapter(mockClient('{}'), 'openai/gpt-5.5');
    await expect(adapter.analyzeVideoFrames(imageRequest())).rejects.toMatchObject({ code: 'INPUT_INVALID' });
    await expect(
      adapter.analyzeImage(imageRequest({ taskModules: ['UI_STRUCTURE', 'PRIVACY'] })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    await expect(adapter.analyzeImage(imageRequest({ projectContext: { projectId: 'p' } }))).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
    await expect(adapter.analyzeImage(imageRequest({ platformContext: { platformId: 'douyin' } }))).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    });
  });

  it('parses golden model-output JSON and rejects decision leakage', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'b24-'));
    const jpegPath = path.join(dir, 'x.jpg');
    await writeFile(jpegPath, MIN_JPEG);
    const adapter = new RealVisualSemanticProviderAdapter(mockClient(JSON.stringify(GOLDEN_MODEL_OUTPUT_V1)), 'openai/gpt-5.5');
    const result = await adapter.analyzeImage(
      imageRequest({
        frames: [
          {
            frameId: 'synthetic-ui-0',
            width: 1280,
            height: 720,
            mediaRef: { kind: 'LOCAL_REF', reference: jpegPath },
            selectionReason: ['IMAGE_PRIMARY'],
          },
        ],
      }),
    );
    expect(result.schemaVersion).toBe('visual.semantic.provider-result:v1');
    expect(result.observations.length).toBeGreaterThan(0);

    const leaky = new RealVisualSemanticProviderAdapter(
      mockClient(JSON.stringify({ ...GOLDEN_MODEL_OUTPUT_V1, assetUsage: 'DO_NOT_USE' })),
      'openai/gpt-5.5',
    );
    await expect(
      leaky.analyzeImage(
        imageRequest({
          frames: [
            {
              frameId: 'synthetic-ui-0',
              width: 1280,
              height: 720,
              mediaRef: { kind: 'LOCAL_REF', reference: jpegPath },
              selectionReason: ['IMAGE_PRIMARY'],
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(VisualSemanticProviderError);
  });

  it('evaluates synthetic ground truth including product header trap', () => {
    const pass = evaluateSyntheticGroundTruth({
      ...visionFixture(),
      observations: visionFixture().observations.concat([
        {
          ...visionFixture().observations[0]!,
          observationId: 'btn',
          type: 'BUTTON_LIKE_REGION',
        },
        {
          ...visionFixture().observations[0]!,
          observationId: 'panel',
          type: 'CONTENT_PANEL',
        },
      ]),
    });
    expect(pass.status).toBe('PASS');
    expect(pass.browserChromeFalsePositive).toBe(false);

    const trapFail = evaluateSyntheticGroundTruth({
      ...visionFixture(),
      observations: [
        { ...visionFixture().observations[0]!, type: 'BROWSER_CHROME' },
        { ...visionFixture().observations[0]!, type: 'PRODUCT_UI', observationId: 'p' },
      ],
      browserChromeObservations: [
        {
          region: { x: 0, y: 0, width: 1, height: 0.1 },
          confidence: 0.9,
          signals: ['ADDRESS_BAR_LIKE'],
          evidenceFrameIds: ['synthetic-ui-0'],
        },
      ],
    });
    expect(trapFail.browserChromeFalsePositive).toBe(true);
    expect(trapFail.status).toBe('FAIL');
  });

  it('renders a 1280x720 synthetic PPM product UI', () => {
    const ppm = renderSyntheticProductUiPpm();
    expect(ppm.toString('ascii', 0, 15)).toContain('P6');
    expect(ppm.toString('ascii')).toContain(`${SYNTHETIC_FIXTURE_WIDTH} ${SYNTHETIC_FIXTURE_HEIGHT}`);
  });

  it('rejects Content #1 asset ids and --file args', () => {
    expect(() => assertSmokeHasNoAssetIdArg(['--file', 'x.jpg'])).toThrow('SMOKE_REJECTS_EXTERNAL_INPUT');
    expect(() => assertNotDogfoodAsset('803fafd2-4c0e-4412-80d7-a0d6452cefac')).toThrow('SMOKE_REJECTS_DOGFOOD_ASSET');
    expect(() => assertNotDogfoodAsset('c59dfd61-old')).toThrow('SMOKE_REJECTS_DOGFOOD_ASSET');
  });
});
