import { describe, expect, it } from 'vitest';
import {
  buildInstrumentalMusicRequest,
  classifyMusicFailure,
  redactMusicEvidence,
} from '../../media/providers/minimax-music.provider.js';
import {
  c6PromptValidation,
  corePathReady,
  FROZEN_LANDSCAPE_SHA,
  FROZEN_VERTICAL_SHA,
  section4ImagePrompt,
  section4NegativePrompt,
} from './capability-execution.js';
import { generateInstrumentalBgm } from './director-v1.js';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';

describe('B2-15O2D capability execution contracts', () => {
  it('builds an instrumental MiniMax request without lyrics and redacts secrets', () => {
    const req = buildInstrumentalMusicRequest();
    expect(req.model).toBe('music-2.6');
    expect(req.is_instrumental).toBe(true);
    expect(req.prompt.toLowerCase()).toContain('no vocals');
    expect(JSON.stringify(req)).not.toMatch(/lyrics":/);
    const redacted = redactMusicEvidence({
      Authorization: 'Bearer super-secret',
      data: { audio: 'https://cdn.example/file.mp3?token=abc' },
    });
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
    expect(JSON.stringify(redacted)).not.toContain('token=abc');
    expect(classifyMusicFailure(401, 2049, 'invalid api key')).toBe('AUTH_OR_PERMISSION');
    expect(classifyMusicFailure(200, 2013, 'This Music API is no longer available to new users')).toBe('AUTH_OR_PERMISSION');
    expect(classifyMusicFailure(429, 1002, 'rate')).toBe('TRANSIENT');
  });

  it('keeps C6 constraints and does not block core on optional failure', () => {
    const prompt = section4ImagePrompt();
    const negative = section4NegativePrompt();
    expect(c6PromptValidation(prompt, negative).safe).toBe(true);
    expect(prompt).toContain('不预设爆款');
    expect(negative.toLowerCase()).toContain('money');
    expect(corePathReady({ scriptOk: true, narrationOk: true, visualsOk: true })).toBe('READY');
    expect(FROZEN_VERTICAL_SHA).toHaveLength(64);
    expect(FROZEN_LANDSCAPE_SHA).toHaveLength(64);
  });

  it('does not mutate frozen script and keeps O2B music stub throw', async () => {
    const beats = loadFrozenScriptBeats();
    expect(beats).toHaveLength(8);
    expect(beats[0].narration).toContain('会写文案的AI');
    await expect(generateInstrumentalBgm()).rejects.toThrow('MINIMAX_MUSIC_NO_REAL_CALL_THIS_STEP');
  });
});
