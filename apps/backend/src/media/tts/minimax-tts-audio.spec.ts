import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { decodeHexAudio, looksLikeAudioUrl } from './minimax-tts-audio.js';

const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x00]);

describe('minimax hex audio', () => {
  it('decodes even-length hex', () => {
    expect(decodeHexAudio(MP3.toString('hex')).equals(MP3)).toBe(true);
    expect(decodeHexAudio(`  ${MP3.toString('hex').toUpperCase()}  `).equals(MP3)).toBe(true);
  });

  it('rejects invalid hex empty audio and urls', () => {
    expect(() => decodeHexAudio('')).toThrow();
    expect(() => decodeHexAudio('abc')).toThrow();
    expect(() => decodeHexAudio('zzzz')).toThrow();
    try {
      decodeHexAudio('gg');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
    }
    expect(looksLikeAudioUrl('https://cdn.example.com/a.mp3')).toBe(true);
    expect(looksLikeAudioUrl(MP3.toString('hex'))).toBe(false);
  });
});
