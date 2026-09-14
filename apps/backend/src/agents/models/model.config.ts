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

export type ModelFailoverConfig = {
  primaryName: string;
  fallback1Name: string;
  failureThreshold: number;
  cooldownMs: number;
};

const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 2;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 900_000;

export function readModelFailoverConfig(env: NodeJS.ProcessEnv = process.env): ModelFailoverConfig {
  return {
    primaryName: env.MODEL_NAME?.trim() ?? '',
    fallback1Name: env.MODEL_FALLBACK_1_NAME?.trim() ?? '',
    failureThreshold: parsePositiveInt(env.MODEL_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_CIRCUIT_FAILURE_THRESHOLD),
    cooldownMs: parsePositiveInt(env.MODEL_CIRCUIT_COOLDOWN_MS, DEFAULT_CIRCUIT_COOLDOWN_MS),
  };
}

export function isModelFailoverEnabled(config = readModelFailoverConfig(), providerId?: string): boolean {
  if (providerId && providerId !== 'real') {
    return false;
  }
  return Boolean(config.primaryName && config.fallback1Name);
}

export const DEFAULT_MODEL_ROUTE_TIMEOUT_MS = 135_000;
export const DEFAULT_MODEL_BACKUP_ROUTE_TIMEOUT_MS = 45_000;
/** Do not start a route attempt that cannot finish before the agent deadline. */
export const MIN_ROUTE_ATTEMPT_MS = 100;

export type ModelRouteTimeoutConfig = {
  primaryMs: number;
  backupMs: number;
};

export function readModelRouteTimeoutConfig(env: NodeJS.ProcessEnv = process.env): ModelRouteTimeoutConfig {
  return {
    primaryMs: parsePositiveInt(env.MODEL_ROUTE_TIMEOUT_MS, DEFAULT_MODEL_ROUTE_TIMEOUT_MS),
    backupMs: parsePositiveInt(env.MODEL_BACKUP_ROUTE_TIMEOUT_MS, DEFAULT_MODEL_BACKUP_ROUTE_TIMEOUT_MS),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
