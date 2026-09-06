import { RuntimeConfigError } from '../../config/runtime-config-error.js';

export type RealModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ModelProviderId = 'mock' | 'real';

export function readRealModelConfig(env: NodeJS.ProcessEnv = process.env): RealModelConfig {
  return {
    apiKey: env.MODEL_API_KEY?.trim() ?? '',
    baseUrl: env.MODEL_BASE_URL?.trim().replace(/\/+$/, '') ?? '',
    model: env.MODEL_NAME?.trim() ?? '',
  };
}

export function isRealModelConfigured(config = readRealModelConfig()): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

export function resolveModelProviderId(env: NodeJS.ProcessEnv = process.env): ModelProviderId {
  if (env.NODE_ENV === 'test') {
    return 'mock';
  }
  const raw = env.MODEL_PROVIDER?.trim().toLowerCase() ?? '';
  if (raw === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new RuntimeConfigError(['MODEL_PROVIDER=mock is not allowed in production']);
    }
    return 'mock';
  }
  if (raw === 'real' || raw === 'router-one') {
    return 'real';
  }
  if (!raw) {
    throw new RuntimeConfigError(['MODEL_PROVIDER is required']);
  }
  throw new RuntimeConfigError(['Unknown MODEL_PROVIDER']);
}
