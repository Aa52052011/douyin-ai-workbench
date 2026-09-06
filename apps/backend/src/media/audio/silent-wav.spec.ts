import { describe, expect, it } from 'vitest';
import { WAV_SAMPLE_RATE, buildSilentWav, parseWavHeader } from './silent-wav.js';

describe('silent WAV', () => {
  it('writes a deterministic RIFF/WAVE file with the requested duration', () => {
    const first = buildSilentWav(3);
    const second = buildSilentWav(3);
    expect(first.equals(second)).toBe(true);
    const header = parseWavHeader(first);
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.sampleRate).toBe(WAV_SAMPLE_RATE);
    expect(header.duration).toBe(3);
    expect(first.byteLength).toBeGreaterThan(44);
  });
});
