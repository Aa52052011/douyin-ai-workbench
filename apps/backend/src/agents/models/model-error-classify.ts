import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';

export type ModelErrorClass = 'FAILOVER_ELIGIBLE' | 'NON_FAILOVER';

export type ClassifiedModelError = {
  class: ModelErrorClass;
  reason: string;
  httpStatus?: number;
};

const NETWORK_TOKEN_RE = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i;
const HTTP_STATUS_RE = /HTTP (\d{3})/;
const FAILOVER_HTTP = new Set([429, 502, 503, 504]);
const NON_FAILOVER_HTTP = new Set([400, 401, 403]);
const NON_FAILOVER_CODES = new Set<string>([
  ErrorCode.AGENT_TIMEOUT,
  ErrorCode.AGENT_INVALID_INPUT,
  ErrorCode.AGENT_INVALID_OUTPUT,
  ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED,
  ErrorCode.VALIDATION_ERROR,
]);

export function classifyModelError(error: unknown): ClassifiedModelError {
  const httpStatus = readHttpStatus(error);
  const networkCode = readNetworkCode(error);
  const code = error instanceof AgentError ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (code && NON_FAILOVER_CODES.has(code)) {
    return { class: 'NON_FAILOVER', reason: code, httpStatus };
  }
  if (httpStatus != null && NON_FAILOVER_HTTP.has(httpStatus)) {
    return { class: 'NON_FAILOVER', reason: `HTTP_${httpStatus}`, httpStatus };
  }
  if (httpStatus != null && FAILOVER_HTTP.has(httpStatus)) {
    return { class: 'FAILOVER_ELIGIBLE', reason: `HTTP_${httpStatus}`, httpStatus };
  }
  if (code === ErrorCode.MODEL_TIMEOUT) {
    return { class: 'FAILOVER_ELIGIBLE', reason: 'MODEL_TIMEOUT', httpStatus };
  }
  if (networkCode) {
    return { class: 'FAILOVER_ELIGIBLE', reason: networkCode, httpStatus };
  }
  if (/provider unavailable/i.test(message)) {
    return { class: 'FAILOVER_ELIGIBLE', reason: 'PROVIDER_UNAVAILABLE', httpStatus };
  }
  return { class: 'NON_FAILOVER', reason: code ?? 'OTHER', httpStatus };
}

export function readHttpStatus(error: unknown): number | undefined {
  if (error instanceof AgentError && typeof error.httpStatus === 'number') {
    return error.httpStatus;
  }
  const message = error instanceof Error ? error.message : String(error);
  const hit = message.match(HTTP_STATUS_RE);
  return hit ? Number(hit[1]) : undefined;
}

export function readNetworkCode(error: unknown): string | undefined {
  if (error instanceof AgentError && error.networkCode) {
    return error.networkCode;
  }
  const parts: string[] = [];
  collectErrorText(error, parts, 0);
  const blob = parts.join(' ');
  const hit = blob.match(NETWORK_TOKEN_RE);
  return hit ? hit[0] : undefined;
}

function collectErrorText(error: unknown, parts: string[], depth: number): void {
  if (depth > 3 || error == null) {
    return;
  }
  if (typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    parts.push(error.code);
  }
  if (error instanceof Error) {
    parts.push(error.message);
    collectErrorText(error.cause, parts, depth + 1);
  }
}
