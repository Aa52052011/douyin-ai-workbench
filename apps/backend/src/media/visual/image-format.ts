import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';

export type VisualImageMime = 'image/png' | 'image/jpeg';

export function isLikelyPng(body: Buffer): boolean {
  return (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  );
}

export function isLikelyJpeg(body: Buffer): boolean {
  return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
}

export function detectImageMime(body: Buffer): VisualImageMime | null {
  if (isLikelyPng(body)) {
    return 'image/png';
  }
  if (isLikelyJpeg(body)) {
    return 'image/jpeg';
  }
  return null;
}

export function extensionForImageMime(mimeType: string | undefined): '.png' | '.jpg' | null {
  if (mimeType === 'image/png') {
    return '.png';
  }
  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }
  return null;
}

export function extensionForSceneImage(body: Buffer, mimeType?: string): '.png' | '.jpg' {
  const detected = detectImageMime(body);
  if (detected === 'image/jpeg') {
    return '.jpg';
  }
  if (detected === 'image/png') {
    return '.png';
  }
  const fromMime = extensionForImageMime(mimeType);
  if (fromMime) {
    return fromMime;
  }
  throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
}

export function filenameForImageMime(mimeType: string, basename: string): string {
  const ext = extensionForImageMime(mimeType);
  if (!ext) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
  }
  return `${basename}${ext}`;
}

export function readImageDimensions(body: Buffer): { width: number; height: number } | null {
  if (isLikelyPng(body) && body.length >= 24) {
    const width = body.readUInt32BE(16);
    const height = body.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return { width, height };
    }
    return null;
  }
  if (!isLikelyJpeg(body)) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = body.readUInt16BE(offset + 5);
      const width = body.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) {
        return { width, height };
      }
      return null;
    }
    const length = body.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

export function assertValidVisualImage(body: Buffer): { mimeType: VisualImageMime; width: number; height: number } {
  if (body.length === 0) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
  }
  const head = body.subarray(0, Math.min(body.length, 32)).toString('utf8').trimStart();
  if (head.startsWith('<!') || head.startsWith('<html') || head.startsWith('{') || head.startsWith('[')) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
  }
  const mimeType = detectImageMime(body);
  if (!mimeType) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
  }
  const dimensions = readImageDimensions(body);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE);
  }
  return { mimeType, ...dimensions };
}
