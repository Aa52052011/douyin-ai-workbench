import { describe, expect, it } from 'vitest';
import { MEDIA_MAX_UPLOAD_BYTES, normalizeLibraryMime } from './media.constants.js';

describe('library upload limits', () => {
  it('defaults to 128MB and maps empty MP4 mime', () => {
    expect(MEDIA_MAX_UPLOAD_BYTES).toBeGreaterThanOrEqual(128 * 1024 * 1024);
    expect(normalizeLibraryMime('', 'clip.mp4')).toBe('video/mp4');
    expect(normalizeLibraryMime('application/octet-stream', 'clip.mp4')).toBe('video/mp4');
    expect(normalizeLibraryMime('video/mp4', 'clip.mp4')).toBe('video/mp4');
    expect(normalizeLibraryMime('text/html', 'x.html')).toBe('text/html');
  });
});
