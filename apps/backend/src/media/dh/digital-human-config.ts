export const DIGITAL_HUMAN_PROVIDER_DISABLED = 'disabled';
export const DIGITAL_HUMAN_PROVIDER_MOCK = 'mock';

export type DigitalHumanProviderId = typeof DIGITAL_HUMAN_PROVIDER_DISABLED | typeof DIGITAL_HUMAN_PROVIDER_MOCK;

export function resolveDigitalHumanProviderId(env: NodeJS.ProcessEnv = process.env): DigitalHumanProviderId {
  const raw = (env.MEDIA_DIGITAL_HUMAN_PROVIDER ?? '').trim().toLowerCase();
  if (!raw || raw === DIGITAL_HUMAN_PROVIDER_DISABLED) {
    return DIGITAL_HUMAN_PROVIDER_DISABLED;
  }
  if (raw === DIGITAL_HUMAN_PROVIDER_MOCK) {
    return DIGITAL_HUMAN_PROVIDER_MOCK;
  }
  return DIGITAL_HUMAN_PROVIDER_DISABLED;
}

/** Real DH execution is never true until a production provider is configured. */
export function isDigitalHumanCurrentlyAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  void env;
  return false;
}
