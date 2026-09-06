import { describe, expect, it } from 'vitest';
import { inferVoicePreset, mapVoiceStyle, normalizeTtsText } from './tts-voice.js';

describe('tts voice mapping', () => {
  it('maps free-text styles deterministically and falls back to configured voice', () => {
    expect(inferVoicePreset('default')).toBe('default');
    expect(inferVoicePreset('冷静、中速、不鸡血')).toBe('calm');
    expect(inferVoicePreset('calm narration')).toBe('calm');
    expect(inferVoicePreset('有力 energetic')).toBe('energetic');
    expect(inferVoicePreset('男声 male')).toBe('male');
    expect(inferVoicePreset('女声 female')).toBe('female');
    expect(mapVoiceStyle('冷静、中速、不鸡血', 'Chinese (Mandarin)_Lyrical_Voice')).toBe(
      'Chinese (Mandarin)_Lyrical_Voice',
    );
    expect(mapVoiceStyle('energetic', 'Chinese (Mandarin)_Lyrical_Voice')).toBe('Chinese (Mandarin)_Lyrical_Voice');
    expect(mapVoiceStyle('male', 'alloy')).toBe('alloy');
  });

  it('normalizes control characters without rewriting copy', () => {
    expect(normalizeTtsText('  你好，\u0000这是测试。\n\n\n下一句  ')).toBe('你好，这是测试。\n\n下一句');
  });
});
