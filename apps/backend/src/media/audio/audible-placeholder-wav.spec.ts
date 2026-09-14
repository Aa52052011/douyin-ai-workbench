import { describe, expect, it } from 'vitest';
import { buildAudiblePlaceholderWav } from './audible-placeholder-wav.js';
import { wavIsAudible, wavPcmPeak } from './wav-pcm.js';

describe('audible placeholder wav', () => {
  it('is deterministic and not digital silence', () => {
    const a = buildAudiblePlaceholderWav(2, 'seed');
    const b = buildAudiblePlaceholderWav(2, 'seed');
    expect(a.equals(b)).toBe(true);
    expect(wavIsAudible(a)).toBe(true);
    expect(wavPcmPeak(a)).toBeGreaterThan(1000);
  });
});
