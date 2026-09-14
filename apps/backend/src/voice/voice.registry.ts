/**
 * Step 13.8 — System Voice registry (virtual profiles; no DB seed).
 * Users never see raw provider voice ids.
 */

import { resolveTtsProviderId, TTS_PROVIDER_MINIMAX, TTS_PROVIDER_OPENAI } from '../media/tts/tts-config.js';
import { readMiniMaxTtsConfig } from '../media/tts/minimax-tts-config.js';
import { readOpenAiTtsConfig } from '../media/tts/tts-config.js';

export const DEFAULT_SYSTEM_VOICE_ID = 'sys.default';

export type SystemVoiceEntry = {
  id: string;
  displayName: string;
  provider: 'mock' | 'openai-tts' | 'minimax-tts';
  /** Internal only — never returned on public list. */
  providerVoiceId: string;
  language: string;
  styleTags: string[];
  supported: boolean;
};

function configuredProviderVoiceId(): { provider: SystemVoiceEntry['provider']; providerVoiceId: string } {
  let provider: SystemVoiceEntry['provider'] = 'mock';
  try {
    provider = resolveTtsProviderId();
  } catch {
    provider = 'mock';
  }
  if (provider === TTS_PROVIDER_MINIMAX) {
    const voice = readMiniMaxTtsConfig().voice.trim();
    return { provider, providerVoiceId: voice || 'system-default' };
  }
  if (provider === TTS_PROVIDER_OPENAI) {
    return { provider, providerVoiceId: readOpenAiTtsConfig().voice.trim() || 'alloy' };
  }
  return { provider: 'mock', providerVoiceId: 'mock-default' };
}

const CATALOG: Array<Omit<SystemVoiceEntry, 'provider' | 'providerVoiceId'>> = [
  { id: DEFAULT_SYSTEM_VOICE_ID, displayName: '系统默认旁白', language: 'zh-CN', styleTags: ['default'], supported: true },
  { id: 'sys.calm', displayName: '沉稳旁白', language: 'zh-CN', styleTags: ['calm', 'narration'], supported: true },
  { id: 'sys.energetic', displayName: '活力旁白', language: 'zh-CN', styleTags: ['energetic'], supported: true },
  { id: 'sys.female', displayName: '女声旁白', language: 'zh-CN', styleTags: ['female'], supported: true },
  { id: 'sys.male', displayName: '男声旁白', language: 'zh-CN', styleTags: ['male'], supported: true },
];

export function listSupportedVoices(): Array<Omit<SystemVoiceEntry, 'providerVoiceId'>> {
  const { provider } = configuredProviderVoiceId();
  return CATALOG.filter((v) => v.supported).map((v) => ({
    ...v,
    provider,
  }));
}

export function listSupportedVoicesPublic(): Array<{
  id: string;
  displayName: string;
  language: string;
  styleTags: string[];
  typeLabel: string;
}> {
  return listSupportedVoices().map((v) => ({
    id: v.id,
    displayName: v.displayName,
    language: v.language,
    styleTags: v.styleTags,
    typeLabel: '系统声音',
  }));
}

export function getVoice(id: string): SystemVoiceEntry | null {
  const catalog = CATALOG.find((v) => v.id === id);
  if (!catalog?.supported) return null;
  const mapped = configuredProviderVoiceId();
  return { ...catalog, ...mapped };
}

export function validateVoiceSelection(id: string | undefined | null): { ok: true; id: string } | { ok: false } {
  if (!id || !id.trim()) {
    return { ok: true, id: DEFAULT_SYSTEM_VOICE_ID };
  }
  if (getVoice(id.trim())) {
    return { ok: true, id: id.trim() };
  }
  return { ok: false };
}

export function mapToProviderVoice(id: string): { provider: string; providerVoiceId: string; styleTag: string } {
  const voice = getVoice(id) ?? getVoice(DEFAULT_SYSTEM_VOICE_ID)!;
  return {
    provider: voice.provider,
    providerVoiceId: voice.providerVoiceId,
    styleTag: voice.styleTags[0] ?? 'default',
  };
}

export function isSystemVoiceId(id: string | undefined | null): boolean {
  return Boolean(id && getVoice(id));
}
