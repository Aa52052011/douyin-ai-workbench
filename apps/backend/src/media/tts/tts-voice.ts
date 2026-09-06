export const VOICE_PRESETS = ['default', 'calm', 'narration', 'energetic', 'male', 'female'] as const;
export type VoicePreset = (typeof VOICE_PRESETS)[number];

export function inferVoicePreset(style: string | undefined): VoicePreset {
  const text = (style ?? '').trim().toLowerCase();
  if (!text || text === 'default') {
    return 'default';
  }
  if (text.includes('男') || /\bmale\b/.test(text)) {
    return 'male';
  }
  if (text.includes('女') || /\bfemale\b/.test(text)) {
    return 'female';
  }
  if (text.includes('有力') || text.includes('活力') || text.includes('热情') || text.includes('energetic')) {
    return 'energetic';
  }
  if (text.includes('冷静') || text.includes('平静') || text.includes('calm') || text.includes('narration') || text.includes('旁白')) {
    return 'calm';
  }
  return 'default';
}

export function mapVoiceStyle(_style: string | undefined, configuredDefaultVoice: string): string {
  const voice = configuredDefaultVoice.trim();
  return voice || 'alloy';
}

export function normalizeTtsText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
