import { VisualSemanticProviderError, type VisualSemanticProviderErrorCode } from '../errors/visual-semantic-error.js';

export type MappedHttpError = {
  code: VisualSemanticProviderErrorCode;
  category: string;
  dataUrlUnsupported: boolean;
  modelVisionUnsupported: boolean;
  authPathFailed: boolean;
  contentRejected: boolean;
};

function bodySnippet(raw: string): string {
  return raw.slice(0, 400).toLowerCase();
}

export function mapVisionHttpError(httpStatus: number, rawBody: string): MappedHttpError {
  const snippet = bodySnippet(rawBody);
  const dataUrlUnsupported = /image_url|data:image|data uri|data_url|base64/.test(snippet) && /not supported|unsupported|invalid/.test(snippet);
  const modelVisionUnsupported = /does not support (image|vision)|vision is not supported|no vision|image input is not supported/.test(snippet);
  const contentRejected = /content.?policy|safety|moderation|rejected/.test(snippet);

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      category: 'AUTH',
      dataUrlUnsupported: false,
      modelVisionUnsupported: false,
      authPathFailed: true,
      contentRejected: false,
    };
  }
  if (httpStatus === 408) {
    return {
      code: 'PROVIDER_TIMEOUT',
      category: 'TIMEOUT',
      dataUrlUnsupported: false,
      modelVisionUnsupported: false,
      authPathFailed: false,
      contentRejected: false,
    };
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    return {
      code: 'PROVIDER_UNAVAILABLE',
      category: 'UNAVAILABLE',
      dataUrlUnsupported: false,
      modelVisionUnsupported: false,
      authPathFailed: false,
      contentRejected: false,
    };
  }
  if (httpStatus === 400 && contentRejected) {
    return {
      code: 'CONTENT_REJECTED',
      category: 'POLICY',
      dataUrlUnsupported: false,
      modelVisionUnsupported: false,
      authPathFailed: false,
      contentRejected: true,
    };
  }
  if (httpStatus === 400 && (dataUrlUnsupported || modelVisionUnsupported)) {
    return {
      code: 'INPUT_INVALID',
      category: 'INPUT',
      dataUrlUnsupported,
      modelVisionUnsupported,
      authPathFailed: false,
      contentRejected: false,
    };
  }
  if (httpStatus === 400) {
    return {
      code: 'INVALID_PROVIDER_RESPONSE',
      category: 'BAD_REQUEST',
      dataUrlUnsupported: false,
      modelVisionUnsupported: false,
      authPathFailed: false,
      contentRejected: false,
    };
  }
  return {
    code: 'UNKNOWN_PROVIDER_ERROR',
    category: 'UNKNOWN',
    dataUrlUnsupported: false,
    modelVisionUnsupported: false,
    authPathFailed: false,
    contentRejected: false,
  };
}

export function throwMappedVisionError(httpStatus: number, rawBody: string): never {
  const mapped = mapVisionHttpError(httpStatus, rawBody);
  throw new VisualSemanticProviderError(mapped.code, mapped.category);
}
