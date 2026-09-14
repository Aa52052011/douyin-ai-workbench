import { DOUYIN_CREATE_VIDEO_PATH, DOUYIN_UPLOAD_VIDEO_PATH } from './douyin-endpoints.js';
import { DouyinProviderError } from './douyin-provider-error.js';
import { redactDouyinSecrets, redactHeaders } from './douyin-secret-redaction.js';
import { isDouyinLiveApiEnabled } from './douyin-runtime-config.js';
import { DOUYIN_CHUNK_ENDPOINTS } from './douyin-upload-policy.js';

export type DouyinHttpMethod = 'GET' | 'POST';

export type DouyinHttpRequest = {
  baseUrl?: string;
  method: DouyinHttpMethod;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  requestId: string;
  endpointName: string;
};

export type DouyinHttpResponse<T = unknown> = {
  status: number;
  json: T;
  requestId: string;
  durationMs: number;
};

export type DouyinMultipartField = {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export interface DouyinHttpTransport {
  request<T>(input: DouyinHttpRequest): Promise<DouyinHttpResponse<T>>;
  sendMultipart<T>(input: DouyinHttpRequest, field: DouyinMultipartField): Promise<DouyinHttpResponse<T>>;
  sendJson<T>(input: DouyinHttpRequest, jsonBody: Record<string, unknown>): Promise<DouyinHttpResponse<T>>;
}

export const SIDE_EFFECT_PATHS = new Set<string>([
  DOUYIN_UPLOAD_VIDEO_PATH,
  DOUYIN_CREATE_VIDEO_PATH,
  DOUYIN_CHUNK_ENDPOINTS.init,
  DOUYIN_CHUNK_ENDPOINTS.uploadPart,
  DOUYIN_CHUNK_ENDPOINTS.complete,
]);

export function isSideEffectPath(path: string): boolean {
  return SIDE_EFFECT_PATHS.has(path) || /upload_video|create_video|video_part_upload/.test(path);
}

export function assertLiveSideEffectAllowed(path: string, liveEnabled = isDouyinLiveApiEnabled()): void {
  if (isSideEffectPath(path) && !liveEnabled) {
    throw new DouyinProviderError('LIVE_CALLS_DISABLED', { endpointName: path });
  }
}

export type FakeHttpScript =
  | { kind: 'json'; status: number; json: unknown }
  | { kind: 'timeout' }
  | { kind: 'network'; message: string }
  | { kind: 'throw'; error: Error };

export class FakeDouyinHttpTransport implements DouyinHttpTransport {
  readonly calls: Array<{ request: DouyinHttpRequest; multipart?: DouyinMultipartField; jsonBody?: Record<string, unknown> }> = [];
  constructor(private readonly script: FakeHttpScript[] = []) {}

  async request<T>(input: DouyinHttpRequest): Promise<DouyinHttpResponse<T>> {
    this.calls.push({ request: input });
    return this.next(input);
  }

  async sendMultipart<T>(input: DouyinHttpRequest, field: DouyinMultipartField): Promise<DouyinHttpResponse<T>> {
    this.calls.push({ request: input, multipart: field });
    return this.next(input);
  }

  async sendJson<T>(input: DouyinHttpRequest, jsonBody: Record<string, unknown>): Promise<DouyinHttpResponse<T>> {
    this.calls.push({ request: input, jsonBody });
    return this.next(input);
  }

  private async next<T>(input: DouyinHttpRequest): Promise<DouyinHttpResponse<T>> {
    const step = this.script.shift() ?? { kind: 'json' as const, status: 200, json: {} };
    if (step.kind === 'timeout') {
      throw new DouyinProviderError('AMBIGUOUS_CREATE_STATE', {
        message: 'timeout after request dispatched',
        endpointName: input.endpointName,
      });
    }
    if (step.kind === 'network') {
      throw new DouyinProviderError('NETWORK_TRANSIENT', { message: step.message, endpointName: input.endpointName });
    }
    if (step.kind === 'throw') {
      throw step.error;
    }
    return { status: step.status, json: step.json as T, requestId: input.requestId, durationMs: 1 };
  }
}

export type DouyinFetch = typeof fetch;

export class RealDouyinHttpTransport implements DouyinHttpTransport {
  constructor(
    private readonly fetchImpl: DouyinFetch = globalThis.fetch.bind(globalThis),
    private readonly liveEnabled: boolean = isDouyinLiveApiEnabled(),
  ) {}

  async request<T>(input: DouyinHttpRequest): Promise<DouyinHttpResponse<T>> {
    assertLiveSideEffectAllowed(input.path, this.liveEnabled);
    return this.execute(input);
  }

  async sendMultipart<T>(input: DouyinHttpRequest, field: DouyinMultipartField): Promise<DouyinHttpResponse<T>> {
    assertLiveSideEffectAllowed(input.path, this.liveEnabled);
    const form = new FormData();
    form.append(field.fieldName, new Blob([Buffer.from(field.bytes)], { type: field.contentType }), field.filename);
    return this.execute(input, form);
  }

  async sendJson<T>(input: DouyinHttpRequest, jsonBody: Record<string, unknown>): Promise<DouyinHttpResponse<T>> {
    assertLiveSideEffectAllowed(input.path, this.liveEnabled);
    return this.execute(input, JSON.stringify(jsonBody), { 'content-type': 'application/json' });
  }

  private async execute<T>(
    input: DouyinHttpRequest,
    body?: BodyInit,
    extraHeaders?: Record<string, string>,
  ): Promise<DouyinHttpResponse<T>> {
    const started = Date.now();
    const url = joinUrl(input.baseUrl ?? 'https://open.douyin.com', input.path, input.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: input.method,
        headers: { ...input.headers, ...extraHeaders },
        body,
        signal: controller.signal,
      });
      const json = (await response.json()) as T;
      return { status: response.status, json, requestId: input.requestId, durationMs: Date.now() - started };
    } catch (error) {
      if (error instanceof DouyinProviderError) throw error;
      if (isAbort(error)) {
        throw new DouyinProviderError(
          input.endpointName.includes('create') ? 'AMBIGUOUS_CREATE_STATE' : 'NETWORK_TRANSIENT',
          { endpointName: input.endpointName, message: redactDouyinSecrets(String(error)) },
        );
      }
      throw new DouyinProviderError('NETWORK_TRANSIENT', {
        endpointName: input.endpointName,
        message: redactDouyinSecrets(String(error)),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function safeLogSnapshot(input: {
  method: string;
  endpointName: string;
  requestId: string;
  durationMs?: number;
  statusCode?: number;
  errorCode?: string | number;
  logId?: string;
  headers?: Record<string, string>;
}): Record<string, unknown> {
  return {
    method: input.method,
    endpointName: input.endpointName,
    requestId: input.requestId,
    durationMs: input.durationMs,
    statusCode: input.statusCode,
    errorCode: input.errorCode,
    logId: input.logId,
    headers: input.headers ? redactHeaders(input.headers) : undefined,
  };
}

function joinUrl(baseUrl: string, path: string, query?: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
