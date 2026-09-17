import { describe, expect, it } from 'vitest';
import { attachmentContentDisposition, videoExportFilename } from './video-export.js';

describe('video export headers', () => {
  it('builds a readable attachment filename from the script title', () => {
    const filename = videoExportFilename('餐饮店不会拍视频，现场生成一周内容方案', 'vertical');
    expect(filename).toBe('餐饮店不会拍视频，现场生成一周内容方案_竖版.mp4');
    expect(attachmentContentDisposition(filename)).toContain('attachment; filename="video_vertical.mp4"');
    expect(attachmentContentDisposition(filename)).toContain("filename*=UTF-8''");
    expect(attachmentContentDisposition(filename)).toContain(encodeURIComponent(filename));
    expect(attachmentContentDisposition('evil\r\nLocation: x')).toBe('attachment; filename="video.mp4"');
  });
});
