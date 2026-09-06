import { AppError, ErrorCode, type ErrorCodeValue } from '../../common/errors/app-error.js';

const PUBLIC_VISUAL_CODES: ErrorCodeValue[] = [
  ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED,
  ErrorCode.VISUAL_PROVIDER_AUTH,
  ErrorCode.VISUAL_PROVIDER_RATE_LIMIT,
  ErrorCode.VISUAL_PROVIDER_QUOTA,
  ErrorCode.VISUAL_PROVIDER_BAD_REQUEST,
  ErrorCode.VISUAL_PROVIDER_TIMEOUT,
  ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE,
  ErrorCode.VISUAL_PROVIDER_DOWNLOAD,
  ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING,
];

export function visualError(code: ErrorCodeValue): AppError {
  return new AppError(code);
}

export function classifyVisualHttpStatus(status: number, vendorCode: string, bodyText: string): ErrorCodeValue {
  const code = vendorCode.toLowerCase();
  const snippet = `${code} ${bodyText.slice(0, 400)}`.toLowerCase();
  if (status === 401 || status === 403 || code.includes('invalidapikey') || code.includes('accessdenied')) {
    return ErrorCode.VISUAL_PROVIDER_AUTH;
  }
  if (status === 429 || code.includes('throttling')) {
    if (snippet.includes('quota') || snippet.includes('allocationquota') || snippet.includes('arrearage')) {
      return ErrorCode.VISUAL_PROVIDER_QUOTA;
    }
    return ErrorCode.VISUAL_PROVIDER_RATE_LIMIT;
  }
  if (status === 408) {
    return ErrorCode.VISUAL_PROVIDER_TIMEOUT;
  }
  if (snippet.includes('quota') || snippet.includes('arrearage') || snippet.includes('balance')) {
    return ErrorCode.VISUAL_PROVIDER_QUOTA;
  }
  if (
    status === 400 ||
    status === 422 ||
    code.includes('invalidparameter') ||
    code.includes('ipinfringement') ||
    code.includes('datainspection')
  ) {
    return ErrorCode.VISUAL_PROVIDER_BAD_REQUEST;
  }
  if (status >= 500) {
    return ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING;
  }
  return ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE;
}

export function classifyWanxVendorCode(vendorCode: string, message: string): ErrorCodeValue | null {
  const code = vendorCode.toLowerCase();
  const snippet = message.toLowerCase();
  if (!code && !snippet) {
    return null;
  }
  if (code.includes('invalidapikey') || code.includes('accessdenied') || code.includes('forbidden')) {
    return ErrorCode.VISUAL_PROVIDER_AUTH;
  }
  if (code.includes('throttling') && (snippet.includes('quota') || code.includes('quota'))) {
    return ErrorCode.VISUAL_PROVIDER_QUOTA;
  }
  if (code.includes('throttling')) {
    return ErrorCode.VISUAL_PROVIDER_RATE_LIMIT;
  }
  if (snippet.includes('quota') || snippet.includes('arrearage')) {
    return ErrorCode.VISUAL_PROVIDER_QUOTA;
  }
  if (
    code.includes('invalidparameter') ||
    code.includes('ipinfringement') ||
    code.includes('datainspection')
  ) {
    return ErrorCode.VISUAL_PROVIDER_BAD_REQUEST;
  }
  return ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE;
}

export function isVisualPublicError(error: unknown): error is AppError {
  return error instanceof AppError && PUBLIC_VISUAL_CODES.includes(error.code);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function sanitizeVisualError(error: unknown, afterGenerationPost: boolean): AppError {
  if (isVisualPublicError(error)) {
    return new AppError(error.code);
  }
  if (isAbortError(error)) {
    return new AppError(
      afterGenerationPost ? ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING : ErrorCode.VISUAL_PROVIDER_TIMEOUT,
    );
  }
  if (afterGenerationPost) {
    return new AppError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING);
  }
  return new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
}

export async function readLimitedResponseBody(response: Response, maxBytes: number, failCode: ErrorCodeValue): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw visualError(failCode);
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw visualError(failCode);
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw visualError(failCode);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
