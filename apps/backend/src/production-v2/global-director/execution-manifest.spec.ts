import { describe, expect, it } from 'vitest';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import { FROZEN_SCRIPT_ID } from '../audio-calibration/audio-integration.js';
import { WANXIANG_VIDEO_ADAPTER } from './wanxiang-video-contract.js';
import {
  buildExecutionManifest,
  coverageMetricsV2,
  creatorIdentityRequirement,
  lockAiImageRequest,
  lockAiVideoRequest,
  lockDigitalHumanRequest,
  musicCredentialReuse,
} from './execution-manifest.js';

describe('B2-15O2C director execution manifest', () => {
  const manifest = buildExecutionManifest({ MINIMAX_TTS_API_KEY: 'x' });
  const beats = loadFrozenScriptBeats();

  it('is EXECUTION_PREPARED and maps 8/8 beats', () => {
    expect(manifest.status).toBe('EXECUTION_PREPARED');
    expect(manifest.scriptId).toBe(FROZEN_SCRIPT_ID);
    expect(manifest.beats).toHaveLength(8);
    expect(manifest.beats.map((b) => b.narrationUnitId)).toEqual(beats.map((b) => `nu:${b.id}`));
    expect(manifest.tasks.some((t) => t.executeStatus === 'RUNNING')).toBe(false);
    expect(manifest.humanApprovalObjectCreated).toBe(false);
  });

  it('classifies generation as enhancement and keeps optional off the critical path', () => {
    expect(lockAiVideoRequest().classification).toBe('ENHANCEMENT');
    expect(lockAiImageRequest().classification).toBe('ENHANCEMENT');
    expect(lockDigitalHumanRequest().classification).toBe('OPTIONAL');
    expect(manifest.criticalPath).not.toContain('task:gen-ai-video:section2');
    expect(manifest.criticalPath).not.toContain('task:gen-ai-image:section4');
    expect(manifest.criticalPath).not.toContain('task:gen-dh:ending');
    expect(manifest.criticalPath).not.toContain('task:generate-bgm');
    expect(manifest.criticalPath).toContain('task:mix-a');
    expect(coverageMetricsV2().existingAssetCoverageRatio).toBe(1);
    expect(coverageMetricsV2().fallbackCoverageRatio).toBe(1);
  });

  it('blocks digital human without self media and forbids generic avatar', () => {
    const dh = manifest.tasks.find((t) => t.type === 'GENERATE_DIGITAL_HUMAN');
    expect(dh?.executeStatus).toBe('BLOCKED_BY_IDENTITY_ASSET');
    expect(manifest.tasks.find((t) => t.taskId === 'task:fallback-cta')?.executeStatus).toBe('READY');
    expect(creatorIdentityRequirement().genericAvatarAllowed).toBe(false);
    expect(creatorIdentityRequirement().availableSelfVideoAssets).toBe(0);
  });

  it('keeps BGM optional and narration-only ready', () => {
    expect(manifest.bgmPlan.decision).toBe('OPTIONAL');
    expect(manifest.bgmPlan.candidateCount).toBe(1);
    expect(manifest.tasks.find((t) => t.taskId === 'task:mix-a')?.executeStatus).toBe('READY');
    expect(manifest.tasks.find((t) => t.taskId === 'task:mix-b')?.executeStatus).toBe('WAITING_FOR_DEPENDENCY');
    expect(musicCredentialReuse({ MINIMAX_TTS_API_KEY: 'x' }).status).toBe('REUSED_EXISTING_CONFIG_UNVERIFIED_FOR_MUSIC');
  });

  it('does not implement Wanxiang video generate', async () => {
    expect(WANXIANG_VIDEO_ADAPTER.getCapabilities().implemented).toBe(false);
    await expect(WANXIANG_VIDEO_ADAPTER.generate({
      requestId: 'x',
      promptBrief: 'n',
      negativeConstraints: [],
      targetDurationMs: 1,
      aspect: '9:16',
      executeNow: false,
    })).rejects.toThrow('WANXIANG_VIDEO_NO_REAL_CALL');
  });

  it('inherits C5/C6 and does not mutate frozen script', () => {
    expect(manifest.truthConstraints).toEqual(['C5', 'C6']);
    expect(manifest.beats.every((b) => b.truthConstraints.includes('C5') && b.truthConstraints.includes('C6'))).toBe(true);
    expect(beats[0].narration).toContain('会写文案的AI');
    expect(manifest.narrationDurationMs).toBe(44927);
    expect(manifest.plannedDurationMs).toBe(45677);
  });
});
