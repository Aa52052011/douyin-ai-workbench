import { describe, expect, it } from 'vitest';
import { promptFingerprint, usageIdempotencyKey } from './usage-idempotency.js';

describe('usage idempotency keys', () => {
  it('keeps short keys stable and hashes long keys', () => {
    expect(usageIdempotencyKey(['tts', 'job', 'v1', 0])).toBe('tts:job:v1:0');
    const long = usageIdempotencyKey(['x'.repeat(200), 'y']);
    expect(long.length).toBeLessThan(120);
    expect(long).toContain(':');
  });

  it('fingerprints prompts so primary and repair differ', () => {
    expect(promptFingerprint('a')).not.toBe(promptFingerprint('a\nrepair'));
  });
});
