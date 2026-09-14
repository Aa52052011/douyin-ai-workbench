import { describe, expect, it } from 'vitest';
import { FROZEN_SCRIPT_ID, VIDEO_DURATION_MS } from '../audio-calibration/audio-integration.js';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import {
  ACCEPTED_NARRATION_MS,
  IDENTITY_PRIORITY,
  LEGACY_SOURCE_TIMELINE,
  MINIMAX_MUSIC_MODEL,
  PRIMARY_BGM_PROVIDER,
  SCRIPT_TIMELINE_AUTHORITY,
  buildContent01DirectorPlan,
  decideBgm,
  generateInstrumentalBgm,
  isLegacySourceDurationAuthority,
  lastFrameFreezeHackUsed,
  musicCredentialStatus,
  scriptDrivenDurationMs,
} from './director-v1.js';

describe('B2-15O2B global director', () => {
  const plan = buildContent01DirectorPlan();

  it('makes frozen script the timeline authority and rejects 35s source as final duration', () => {
    expect(plan.authority).toBe(SCRIPT_TIMELINE_AUTHORITY);
    expect(plan.legacyTimeline).toBe(LEGACY_SOURCE_TIMELINE);
    expect(plan.scriptId).toBe(FROZEN_SCRIPT_ID);
    expect(isLegacySourceDurationAuthority(plan.plannedDurationMs)).toBe(false);
    expect(plan.plannedDurationMs).toBe(scriptDrivenDurationMs());
    expect(plan.plannedDurationMs).toBeGreaterThan(ACCEPTED_NARRATION_MS);
    expect(plan.plannedDurationMs).not.toBe(VIDEO_DURATION_MS);
    expect(plan.narrationDurationMs).toBe(ACCEPTED_NARRATION_MS);
  });

  it('does not rewrite the frozen 8-unit script', () => {
    const beats = loadFrozenScriptBeats();
    expect(beats).toHaveLength(8);
    expect(plan.beats).toHaveLength(8);
    expect(beats[0].narration).toContain('会写文案的AI');
    expect(plan.beats.map((b) => b.narrationUnitId)).toEqual(beats.map((b) => `nu:${b.id}`));
  });

  it('reuses assets first and only plans generation when coverage is incomplete', () => {
    expect(plan.routes.every((r) => r.reuseFirst)).toBe(true);
    expect(plan.generationRequests.every((g) => g.executeNow === false)).toBe(true);
    expect(plan.coverage.uncovered).toBe(0);
    expect(plan.generationRequests.length).toBe(plan.routes.filter((r) => r.generationNeeded).length);
  });

  it('keeps USER_SELF_FIRST and never auto-uses a stranger avatar', () => {
    expect(plan.creatorIdentity.default).toBe('USER_SELF_FIRST');
    expect(plan.creatorIdentity.priority).toEqual([...IDENTITY_PRIORITY]);
    expect(plan.creatorIdentity.silentGenericAvatarForbidden).toBe(true);
    expect(plan.identityInventory.genericAvatarAllowed).toBe(false);
    expect(plan.creatorIdentity.digitalHumanMandatory).toBe(false);
  });

  it('gives director BGM authority without forcing music on every video', () => {
    expect(decideBgm({ contentType: 'VOICE_ESSAY', narrationDensity: 'LOW', hasUserBgm: false, hasLicensedBgm: false, musicCapability: false }).decision).toBe('NOT_NEEDED');
    expect(plan.bgm.decision).toBe('OPTIONAL');
    expect(PRIMARY_BGM_PROVIDER).toBe('MINIMAX_MUSIC_2_6');
    expect(MINIMAX_MUSIC_MODEL).toBe('music-2.6');
    expect(plan.bgmBrief?.vocalsAllowed).toBe(false);
    expect(plan.bgmBrief?.targetDurationMs).toBe(plan.plannedDurationMs);
    expect(plan.audioMix.narrationPriority).toBe('HIGH');
  });

  it('does not call MiniMax Music in this step', async () => {
    await expect(generateInstrumentalBgm()).rejects.toThrow('MINIMAX_MUSIC_NO_REAL_CALL_THIS_STEP');
    expect(musicCredentialStatus({ MINIMAX_TTS_API_KEY: 'x' }).status).toBe('NOT_TESTED_NO_REAL_CALL');
  });

  it('keeps shot quota none, no freeze hack, and C5/C6', () => {
    expect(plan.shotQuota).toBe('NONE');
    expect(lastFrameFreezeHackUsed()).toBe(false);
    expect(plan.lastFrameFreezeHack).toBe(false);
    expect(plan.truthConstraints).toEqual(['C5', 'C6']);
    expect(plan.duties).toContain('BgmDecision');
    expect(plan.duties).toContain('AssetRouting');
  });
});
