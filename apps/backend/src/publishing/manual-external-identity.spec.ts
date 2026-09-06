import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import {
  parseManualExternalPostId,
  parseManualExternalUrl,
  requireManualExternalIdentity,
  sameManualExternalIdentity,
} from './manual-external-identity.js';

describe('manual external identity', () => {
  it('accepts https URLs without fetching', () => {
    expect(parseManualExternalUrl('https://www.douyin.com/video/123')).toBe('https://www.douyin.com/video/123');
    expect(parseManualExternalUrl('http://example.com/p/1')).toBe('http://example.com/p/1');
  });

  it('rejects non-http schemes and control chars', () => {
    expect(() => parseManualExternalUrl('douyin://video/1')).toThrowError();
    expect(() => parseManualExternalUrl('javascript:alert(1)')).toThrowError();
    expect(() => parseManualExternalUrl('https://example.com/a\nb')).toThrowError();
    try {
      parseManualExternalUrl('ftp://example.com/a');
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    }
  });

  it('rejects control characters in externalPostId', () => {
    expect(() => parseManualExternalPostId('id\u0001x')).toThrowError();
    expect(parseManualExternalPostId('  abc-123  ')).toBe('abc-123');
  });

  it('requires at least one identity field', () => {
    try {
      requireManualExternalIdentity({});
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.MANUAL_PUBLICATION_EXTERNAL_IDENTITY_REQUIRED });
    }
    expect(requireManualExternalIdentity({ externalUrl: 'https://example.com/p' }).externalUrl).toBe(
      'https://example.com/p',
    );
  });

  it('compares published identities exactly', () => {
    expect(
      sameManualExternalIdentity(
        { externalPostId: 'a', externalUrl: null },
        { externalPostId: 'a', externalUrl: null },
      ),
    ).toBe(true);
    expect(
      sameManualExternalIdentity(
        { externalPostId: 'a', externalUrl: null },
        { externalPostId: 'a', externalUrl: 'https://example.com/p' },
      ),
    ).toBe(false);
  });
});
