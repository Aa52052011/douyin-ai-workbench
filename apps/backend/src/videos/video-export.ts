const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

export function videoExportFilename(videoId: string): string {
  return `video-${videoId}.mp4`;
}

export function attachmentContentDisposition(filename: string): string {
  if (!SAFE_FILENAME.test(filename) || filename.includes('..')) {
    return 'attachment; filename="video.mp4"';
  }
  return `attachment; filename="${filename}"`;
}
