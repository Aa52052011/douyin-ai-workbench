import { describe, expect, it } from 'vitest';
import { canFinalizeDisposition, runDeterministicQualityChecks } from './quality-check.js';
import type { QualityCheckInput } from './quality.types.js';

function base(overrides: Partial<QualityCheckInput> = {}): QualityCheckInput {
  const assets = [
    { id: 'v1', tenantId: 't1', type: 'IMAGE', status: 'READY', referenceOnly: false, exists: true },
    { id: 'v2', tenantId: 't1', type: 'VIDEO', status: 'READY', referenceOnly: false, exists: true },
    { id: 'a1', tenantId: 't1', type: 'AUDIO', status: 'READY', referenceOnly: false, exists: true },
    { id: 's1', tenantId: 't1', type: 'SUBTITLE', status: 'READY', referenceOnly: false, exists: true },
  ];
  return {
    qualityInputHash: 'hash1',
    attempt: 0,
    composeProvider: 'ffmpeg-compose',
    fileExists: true,
    storageExists: true,
    probe: {
      duration: 4,
      hasVideo: true,
      hasAudio: true,
      width: 1080,
      height: 1920,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
    },
    probeFailed: false,
    expectedWidth: 1080,
    expectedHeight: 1920,
    expectedFps: 30,
    targetDurationSec: 4,
    voiceDurationSec: 4,
    timelineDurationMs: 4000,
    voiceExpected: true,
    hasCtaInPlan: true,
    timeline: {
      durationMs: 4000,
      tracks: {
        visual: [
          { sequence: 1, startMs: 0, endMs: 2000, assetId: 'v1', assetType: 'IMAGE', purpose: 'HOOK' },
          { sequence: 2, startMs: 2000, endMs: 4000, assetId: 'v2', assetType: 'VIDEO', purpose: 'CTA' },
        ],
        voice: [{ assetId: 'a1' }],
        subtitle: [{ assetId: 's1' }],
      },
    },
    assets,
    subtitleCues: [{ start: 0, end: 4, text: '你好世界' }],
    canvasWidth: 1080,
    ...overrides,
  };
}

describe('deterministic quality checks', () => {
  it('valid media PASS', () => {
    const result = runDeterministicQualityChecks(base());
    expect(result.status).toBe('PASS');
    expect(result.finalDisposition).toBe('PASS');
  });

  it('corrupted BLOCK', () => {
    const result = runDeterministicQualityChecks(base({ probe: null, probeFailed: true }));
    expect(result.issues.some((item) => item.code === 'MEDIA_CORRUPTED')).toBe(true);
    expect(result.finalDisposition).toBe('BLOCKED');
  });

  it('missing video stream', () => {
    const result = runDeterministicQualityChecks(
      base({ probe: { duration: 4, hasVideo: false, hasAudio: true, width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac' } }),
    );
    expect(result.issues.some((item) => item.code === 'VIDEO_STREAM_MISSING')).toBe(true);
  });

  it('missing audio when required', () => {
    const result = runDeterministicQualityChecks(
      base({ probe: { duration: 4, hasVideo: true, hasAudio: false, width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac' } }),
    );
    expect(result.issues.some((item) => item.code === 'AUDIO_STREAM_MISSING')).toBe(true);
  });

  it('duration mismatch', () => {
    const result = runDeterministicQualityChecks(base({ probe: { duration: 9, hasVideo: true, hasAudio: true, width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac' } }));
    expect(result.issues.some((item) => item.code === 'DURATION_MISMATCH')).toBe(true);
  });

  it('resolution invalid', () => {
    const result = runDeterministicQualityChecks(base({ probe: { duration: 4, hasVideo: true, hasAudio: true, width: 720, height: 1280, fps: 30, videoCodec: 'h264', audioCodec: 'aac' } }));
    expect(result.issues.some((item) => item.code === 'RESOLUTION_INVALID')).toBe(true);
  });

  it('timeline gap', () => {
    const result = runDeterministicQualityChecks(
      base({
        timeline: {
          durationMs: 4000,
          tracks: {
            visual: [{ sequence: 1, startMs: 0, endMs: 1000, assetId: 'v1', assetType: 'IMAGE', purpose: 'HOOK' }],
            voice: [{ assetId: 'a1' }],
            subtitle: [{ assetId: 's1' }],
          },
        },
      }),
    );
    expect(result.issues.some((item) => item.code === 'TIMELINE_GAP')).toBe(true);
  });

  it('reference asset', () => {
    const result = runDeterministicQualityChecks(
      base({
        assets: [
          { id: 'v1', tenantId: 't1', type: 'IMAGE', status: 'READY', referenceOnly: true, exists: true },
          { id: 'v2', tenantId: 't1', type: 'VIDEO', status: 'READY', referenceOnly: false, exists: true },
          { id: 'a1', tenantId: 't1', type: 'AUDIO', status: 'READY', referenceOnly: false, exists: true },
        ],
      }),
    );
    expect(result.issues.some((item) => item.code === 'REFERENCE_ASSET_USED')).toBe(true);
    expect(result.finalDisposition).toBe('BLOCKED');
  });

  it('revoked asset', () => {
    const result = runDeterministicQualityChecks(
      base({
        assets: [
          { id: 'v1', tenantId: 't1', type: 'IMAGE', status: 'READY', referenceOnly: false, consentStatus: 'REVOKED', exists: true },
          { id: 'v2', tenantId: 't1', type: 'VIDEO', status: 'READY', referenceOnly: false, exists: true },
          { id: 'a1', tenantId: 't1', type: 'AUDIO', status: 'READY', referenceOnly: false, exists: true },
        ],
      }),
    );
    expect(result.issues.some((item) => item.code === 'ASSET_REVOKED')).toBe(true);
  });

  it('subtitle overflow', () => {
    const result = runDeterministicQualityChecks(
      base({ subtitleCues: [{ start: 0, end: 4, text: '这是一句远远超过安全字数限制的中文字幕内容测试溢出'.repeat(4) }] }),
    );
    expect(result.issues.some((item) => item.code === 'SUBTITLE_OVERFLOW_RISK')).toBe(true);
  });

  it('subtitle out of range', () => {
    const result = runDeterministicQualityChecks(base({ subtitleCues: [{ start: 0, end: 12, text: '你好' }] }));
    expect(result.issues.some((item) => item.code === 'SUBTITLE_OUT_OF_RANGE')).toBe(true);
  });

  it('CTA missing', () => {
    const result = runDeterministicQualityChecks(
      base({
        hasCtaInPlan: true,
        timeline: {
          durationMs: 4000,
          tracks: {
            visual: [
              { sequence: 1, startMs: 0, endMs: 2000, assetId: 'v1', assetType: 'IMAGE', purpose: 'HOOK' },
              { sequence: 2, startMs: 2000, endMs: 4000, assetId: 'v2', assetType: 'VIDEO', purpose: 'OTHER' },
            ],
            voice: [{ assetId: 'a1' }],
            subtitle: [{ assetId: 's1' }],
          },
        },
      }),
    );
    expect(result.issues.some((item) => item.code === 'CTA_MISSING')).toBe(true);
  });

  it('shot too long', () => {
    const result = runDeterministicQualityChecks(
      base({
        timelineDurationMs: 25_000,
        voiceDurationSec: 25,
        probe: { duration: 25, hasVideo: true, hasAudio: true, width: 1080, height: 1920, fps: 30, videoCodec: 'h264', audioCodec: 'aac' },
        timeline: {
          durationMs: 25_000,
          tracks: {
            visual: [{ sequence: 1, startMs: 0, endMs: 25_000, assetId: 'v1', assetType: 'IMAGE', purpose: 'CTA' }],
            voice: [{ assetId: 'a1' }],
            subtitle: [{ assetId: 's1' }],
          },
        },
        subtitleCues: [{ start: 0, end: 25, text: '你好' }],
      }),
    );
    expect(result.issues.some((item) => item.code === 'SHOT_TOO_LONG')).toBe(true);
  });

  it('repeated asset', () => {
    const result = runDeterministicQualityChecks(
      base({
        timeline: {
          durationMs: 4000,
          tracks: {
            visual: [
              { sequence: 1, startMs: 0, endMs: 2000, assetId: 'v1', assetType: 'IMAGE', purpose: 'HOOK' },
              { sequence: 2, startMs: 2000, endMs: 4000, assetId: 'v1', assetType: 'IMAGE', purpose: 'CTA' },
            ],
            voice: [{ assetId: 'a1' }],
            subtitle: [{ assetId: 's1' }],
          },
        },
      }),
    );
    expect(result.issues.some((item) => item.code === 'REPEATED_ASSET')).toBe(true);
  });

  it('legacy missing checkpoint can finalize', () => {
    expect(canFinalizeDisposition(undefined, false)).toBe(true);
    expect(canFinalizeDisposition('PASS', true)).toBe(true);
    expect(canFinalizeDisposition('BEST_AVAILABLE', true)).toBe(true);
    expect(canFinalizeDisposition('BLOCKED', true)).toBe(false);
  });
});
