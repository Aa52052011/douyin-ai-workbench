import { describe, expect, it } from 'vitest';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import {
  AUDIO_POLICY,
  FROZEN_SCRIPT_ID,
  VIDEO_DURATION_MS,
  assertCalibOutputPath,
  frozenScriptFingerprint,
  muxAacArgs,
  scriptAudit,
  sequentialLayout,
  speechRatePlan,
  ttsProviderAuditFromEnv,
  bgmPolicy,
  estimatedVisualTimeline,
  loudnormFilter,
} from './audio-integration.js';

describe('B2-15O2 audio calibration', () => {
  it('reuses frozen Content #1 script without rewrite', () => {
    const audit = scriptAudit();
    expect(audit.found).toBe(true);
    expect(audit.scriptId).toBe(FROZEN_SCRIPT_ID);
    expect(audit.narrationUnitCount).toBe(8);
    expect(audit.rewriteForbidden).toBe(true);
    expect(loadFrozenScriptBeats()[0].narration).toContain('会写文案的AI');
    expect(frozenScriptFingerprint()).toHaveLength(64);
  });

  it('keeps estimated visual narration binding and sequential audio layout', () => {
    const visual = estimatedVisualTimeline();
    expect(visual[0].syncMode).toBe('ESTIMATED_ALIGNMENT');
    expect(visual[visual.length - 1].visualEndMs).toBe(VIDEO_DURATION_MS);
    const laid = sequentialLayout({
      units: visual.map((item) => ({
        unitId: item.unitId,
        textRef: item.textRef,
        naturalMs: 2000,
        visualBindingRef: `${item.visualStartMs}-${item.visualEndMs}`,
      })),
      videoMs: VIDEO_DURATION_MS,
      atempo: 1,
    });
    expect(laid[0].startMs).toBe(0);
    expect(laid.every((item) => item.endMs > item.startMs)).toBe(true);
  });

  it('rejects 2x speech rate and keeps 0.90-1.10', () => {
    expect(speechRatePlan(20_000, 35_000).ok).toBe(true);
    expect(speechRatePlan(36_000, 35_000).atempo).toBeLessThanOrEqual(1.1);
    expect(speechRatePlan(50_000, 35_000).ok).toBe(false);
  });

  it('muxes AAC 48k stereo and never writes production artifacts', () => {
    const args = muxAacArgs('/tmp/v.mp4', '/tmp/a.m4a', '/tmp/Vertical_AudioCalib_Narration.mp4', 35.067);
    expect(args).toContain('aac');
    expect(args).toContain('48000');
    expect(args.join(' ')).toContain('160k');
    expect(() => assertCalibOutputPath('/.local/production-artifacts/t/s/vertical.douyin.v1.mp4')).toThrow();
  });

  it('keeps narration-only legal when no licensed BGM exists', () => {
    expect(bgmPolicy(false)).toMatchObject({ used: false, available: false, narrationOnlyLegal: true, downloadForbidden: true });
  });

  it('uses loudnorm target near -16 LUFS and TP -1', () => {
    expect(loudnormFilter()).toContain('I=-16');
    expect(loudnormFilter()).toContain('TP=-1');
    expect(AUDIO_POLICY.sampleRate).toBe(48000);
  });

  it('does not treat mock TTS as configured human audio', () => {
    expect(ttsProviderAuditFromEnv({ MEDIA_TTS_PROVIDER: 'mock' }).mockBlocked).toBe(true);
    expect(ttsProviderAuditFromEnv({ MEDIA_TTS_PROVIDER: 'minimax-tts' }).missing).toContain('MINIMAX_TTS_API_KEY');
    expect(
      ttsProviderAuditFromEnv({
        MEDIA_TTS_PROVIDER: 'openai-tts',
        TTS_API_KEY: 'x',
        TTS_BASE_URL: 'https://example.invalid',
        TTS_MODEL: 'tts-1',
      }).configured,
    ).toBe(true);
  });
});
