import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { MIN_PNG } from '../media.constants.js';
import {
  assertValidVisualImage,
  detectImageMime,
  extensionForSceneImage,
  filenameForImageMime,
  isLikelyJpeg,
  isLikelyPng,
} from './image-format.js';

const MIN_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

describe('image format mapping', () => {
  it('detects png and jpeg from magic bytes', () => {
    expect(isLikelyPng(MIN_PNG)).toBe(true);
    expect(detectImageMime(MIN_PNG)).toBe('image/png');
    expect(extensionForSceneImage(MIN_PNG, 'image/jpeg')).toBe('.png');
    expect(filenameForImageMime('image/png', 'hook')).toBe('hook.png');
    expect(isLikelyJpeg(MIN_JPEG)).toBe(true);
    expect(detectImageMime(MIN_JPEG)).toBe('image/jpeg');
    expect(extensionForSceneImage(MIN_JPEG, 'image/png')).toBe('.jpg');
    expect(filenameForImageMime('image/jpeg', 'opening')).toBe('opening.jpg');
  });

  it('does not treat webp as a v1 visual format', () => {
    const webp = Buffer.from('RIFF....WEBP', 'ascii');
    expect(detectImageMime(webp)).toBeNull();
    expect(() => extensionForSceneImage(webp, 'image/webp')).toThrow(
      expect.objectContaining({ code: ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE }),
    );
    expect(() => assertValidVisualImage(webp)).toThrow(
      expect.objectContaining({ code: ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE }),
    );
    expect(() => assertValidVisualImage(Buffer.from('<html>nope</html>'))).toThrow(
      expect.objectContaining({ code: ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE }),
    );
  });
});
