export const VOICE_CLONE_PROVIDER_DISABLED = 'disabled';
export const VOICE_CLONE_PROVIDER_MOCK = 'mock';

export type VoiceCloneProviderId = typeof VOICE_CLONE_PROVIDER_DISABLED | typeof VOICE_CLONE_PROVIDER_MOCK;

export function resolveVoiceCloneProviderId(env: NodeJS.ProcessEnv = process.env): VoiceCloneProviderId {
  const raw = (env.MEDIA_VOICE_CLONE_PROVIDER ?? '').trim().toLowerCase();
  if (!raw || raw === VOICE_CLONE_PROVIDER_DISABLED) {
    return VOICE_CLONE_PROVIDER_DISABLED;
  }
  if (raw === VOICE_CLONE_PROVIDER_MOCK) {
    return VOICE_CLONE_PROVIDER_MOCK;
  }
  return VOICE_CLONE_PROVIDER_DISABLED;
}

/** Real clone execution is never true until a production provider is configured. */
export function isVoiceCloneCurrentlyAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  void env;
  return false;
}
