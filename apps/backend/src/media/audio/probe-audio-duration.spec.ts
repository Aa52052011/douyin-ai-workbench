import { describe, expect, it } from 'vitest';
import { buildSilentWav } from './silent-wav.js';
import { probeAudioDuration } from './probe-audio-duration.js';

describe('probeAudioDuration', () => {
  it('reads duration from a legal wav header without character estimates', async () => {
    const duration = await probeAudioDuration(buildSilentWav(2), 'audio/wav');
    expect(duration).toBe(2);
  });
});
