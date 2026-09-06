import { describe, expect, it } from 'vitest';
import { attachmentContentDisposition, videoExportFilename } from './video-export.js';

describe('video export headers', () => {
  it('builds a safe attachment filename from video id', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const filename = videoExportFilename(id);
    expect(filename).toBe(`video-${id}.mp4`);
    expect(attachmentContentDisposition(filename)).toBe(`attachment; filename="${filename}"`);
    expect(attachmentContentDisposition('evil\r\nLocation: x')).toBe('attachment; filename="video.mp4"');
  });
});
