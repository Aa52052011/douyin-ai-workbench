const UNSAFE_TITLE = /[\\/:*?"<>|\r\n]+/g;

export function videoExportFilename(title?: string | null, variant: 'vertical' | 'landscape' = 'vertical'): string {
  const suffix = variant === 'landscape' ? '横版' : '竖版';
  const base = sanitizeExportTitle(title) || '视频';
  return `${base}_${suffix}.mp4`;
}

export function attachmentContentDisposition(filename: string): string {
  if (!filename || filename.includes('..') || /[\r\n"]/.test(filename)) {
    return 'attachment; filename="video.mp4"';
  }
  const ascii = asciiFallbackFilename(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sanitizeExportTitle(title?: string | null): string {
  return (title ?? '').replace(UNSAFE_TITLE, '').replace(/\s+/g, '').trim().slice(0, 40);
}

function asciiFallbackFilename(filename: string): string {
  if (filename.endsWith('_横版.mp4')) {
    return 'video_landscape.mp4';
  }
  if (filename.endsWith('_竖版.mp4')) {
    return 'video_vertical.mp4';
  }
  return 'video.mp4';
}
