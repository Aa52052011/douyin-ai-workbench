import { DEFAULT_SYSTEM_VOICE_ID, isSystemVoiceId, mapToProviderVoice, validateVoiceSelection } from './voice.registry.js';

export type ResolvedVoiceConfig = {
  voiceType: 'SYSTEM' | 'CUSTOM' | 'CLONED';
  provider: string;
  providerVoiceId: string;
  resolvedVoiceId: string;
  voiceProfileId?: string;
  speed?: number;
  emotion?: string;
  tone?: string;
};

/**
 * Deterministic voice selection:
 * preferredVoiceId → director recommendation → DEFAULT_SYSTEM_VOICE_ID
 * Invalid ids fall back to default. Does not auto-create clone/custom.
 */
export function resolveVoiceConfig(input: {
  preferredVoiceId?: string;
  directorVoiceId?: string;
  voiceProfileId?: string;
  voiceType?: 'SYSTEM' | 'CUSTOM' | 'CLONED';
  customProvider?: string;
  customProviderVoiceId?: string;
}): ResolvedVoiceConfig {
  const preferred = input.preferredVoiceId?.trim();
  const director = input.directorVoiceId?.trim();
  if (input.voiceType === 'CUSTOM' || input.voiceType === 'CLONED') {
    if (input.customProvider && input.customProviderVoiceId && input.voiceProfileId) {
      return {
        voiceType: input.voiceType,
        provider: input.customProvider,
        providerVoiceId: input.customProviderVoiceId,
        resolvedVoiceId: input.voiceProfileId,
        voiceProfileId: input.voiceProfileId,
      };
    }
    // Clone/custom requested but not executable → system fallback
  }
  const candidate = preferred || director || DEFAULT_SYSTEM_VOICE_ID;
  const validated = validateVoiceSelection(candidate);
  const id = validated.ok ? validated.id : DEFAULT_SYSTEM_VOICE_ID;
  const mapped = mapToProviderVoice(isSystemVoiceId(id) ? id : DEFAULT_SYSTEM_VOICE_ID);
  return {
    voiceType: 'SYSTEM',
    provider: mapped.provider,
    providerVoiceId: mapped.providerVoiceId,
    resolvedVoiceId: isSystemVoiceId(id) ? id : DEFAULT_SYSTEM_VOICE_ID,
    tone: mapped.styleTag,
  };
}
