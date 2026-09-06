export type FfprobeSummary = {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
  size?: number;
};

function parseFrameRate(raw: string | undefined): number | undefined {
  if (!raw || raw === '0/0') {
    return undefined;
  }
  const [numerator, denominator] = raw.split('/').map(Number);
  if (!Number.isFinite(numerator)) {
    return undefined;
  }
  if (!denominator) {
    return numerator;
  }
  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

export function parseFfprobeJson(raw: string): FfprobeSummary | null {
  try {
    const parsed = JSON.parse(raw) as {
      format?: { duration?: string; size?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        r_frame_rate?: string;
      }>;
    };
    const duration = Number(parsed.format?.duration);
    const video = parsed.streams?.find((item) => item.codec_type === 'video');
    const audio = parsed.streams?.find((item) => item.codec_type === 'audio');
    if (!Number.isFinite(duration) || duration <= 0 || !video || !audio) {
      return null;
    }
    const size = Number(parsed.format?.size);
    return {
      duration,
      hasVideo: true,
      hasAudio: true,
      width: video.width,
      height: video.height,
      videoCodec: video.codec_name,
      audioCodec: audio.codec_name,
      fps: parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate),
      size: Number.isFinite(size) && size > 0 ? size : undefined,
    };
  } catch {
    return null;
  }
}

export function parseFfprobeAudioDuration(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    const duration = Number(parsed.format?.duration);
    const audio = parsed.streams?.find((item) => item.codec_type === 'audio');
    if (!Number.isFinite(duration) || duration <= 0 || !audio) {
      return null;
    }
    return duration;
  } catch {
    return null;
  }
}

export function buildFfprobeArgs(filePath: string): string[] {
  return ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath];
}
