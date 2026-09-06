import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { buildSilentWav } from './silent-wav.js';
import {
  assertAudioMatchesFormat,
  detectAudioMime,
  extensionForAudioMime,
  filenameForAudioMime,
  isLikelyMp3,
  isLikelyWav,
} from './audio-format.js';

const MIN_MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x00]);

describe('audio format mapping', () => {
  it('maps mime and extension consistently', () => {
    expect(filenameForAudioMime('audio/mpeg')).toBe('voice.mp3');
    expect(filenameForAudioMime('audio/wav')).toBe('voice.wav');
    expect(extensionForAudioMime('audio/mpeg')).toBe('.mp3');
    expect(extensionForAudioMime('audio/wav')).toBe('.wav');
  });

  it('validates wav and mp3 magic bytes', () => {
    const wav = buildSilentWav(1);
    expect(isLikelyWav(wav)).toBe(true);
    expect(detectAudioMime(wav)).toBe('audio/wav');
    assertAudioMatchesFormat(wav, 'wav', 'audio/wav');
    expect(isLikelyMp3(MIN_MP3)).toBe(true);
    assertAudioMatchesFormat(MIN_MP3, 'mp3', 'audio/mpeg');
  });

  it('rejects empty, html, json, and content-type mismatches', () => {
    expect(() => assertAudioMatchesFormat(Buffer.alloc(0), 'mp3', 'audio/mpeg')).toThrow();
    expect(() => assertAudioMatchesFormat(Buffer.from('<html>nope</html>'), 'mp3', 'audio/mpeg')).toThrow();
    expect(() => assertAudioMatchesFormat(Buffer.from('{"error":"x"}'), 'mp3', 'application/json')).toThrow();
    expect(() => assertAudioMatchesFormat(buildSilentWav(1), 'mp3', 'audio/mpeg')).toThrow();
    try {
      filenameForAudioMime('application/json');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.TTS_PROVIDER_INVALID_RESPONSE);
    }
  });
});
