import { parseFfprobeFrameRate } from '../../media/ffmpeg/ffprobe.js';

export const DETERMINISTIC_MEDIA_ERROR = {
  MEDIA_PROBE_FAILED: 'MEDIA_PROBE_FAILED',
  NO_VIDEO_STREAM: 'NO_VIDEO_STREAM',
  INVALID_MEDIA_DIMENSIONS: 'INVALID_MEDIA_DIMENSIONS',
  INVALID_ASPECT_RATIO: 'INVALID_ASPECT_RATIO',
  UNSUPPORTED_MEDIA_METADATA: 'UNSUPPORTED_MEDIA_METADATA',
} as const;

export type DeterministicMediaErrorCode = (typeof DETERMINISTIC_MEDIA_ERROR)[keyof typeof DETERMINISTIC_MEDIA_ERROR];

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  nb_frames?: string;
  disposition?: { default?: number };
};

type ProbeJson = {
  format?: { duration?: string; size?: string };
  streams?: ProbeStream[];
};

export type AnalyzerFfprobeParse =
  | {
      ok: true;
      width: number;
      height: number;
      durationSec?: number;
      fps?: number;
      frameCount?: number;
      videoCodec?: string;
      audioCodec?: string;
      hasAudio: boolean;
      sampleRate?: number;
      channels?: number;
      fileSize?: number;
    }
  | { ok: false; code: DeterministicMediaErrorCode };

function isDefaultStream(stream: ProbeStream): boolean {
  return stream.disposition?.default === 1;
}

function usableVideo(stream: ProbeStream): boolean {
  return (
    stream.codec_type === 'video' &&
    Number.isFinite(stream.width) &&
    Number.isFinite(stream.height) &&
    (stream.width ?? 0) > 0 &&
    (stream.height ?? 0) > 0
  );
}

function pickVideo(streams: ProbeStream[]): ProbeStream | undefined {
  const videos = streams.filter(usableVideo);
  return videos.find(isDefaultStream) ?? videos[0];
}

function pickAudio(streams: ProbeStream[]): ProbeStream | undefined {
  const audios = streams.filter((item) => item.codec_type === 'audio');
  return audios.find(isDefaultStream) ?? audios[0];
}

function parsePositiveNumber(raw: string | number | undefined): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parseDurationSec(parsed: ProbeJson, video: ProbeStream, audio: ProbeStream | undefined): number | undefined {
  return (
    parsePositiveNumber(parsed.format?.duration) ??
    parsePositiveNumber(video.duration) ??
    parsePositiveNumber(audio?.duration)
  );
}

export function parseAnalyzerFfprobeJson(raw: string): AnalyzerFfprobeParse {
  let parsed: ProbeJson;
  try {
    parsed = JSON.parse(raw) as ProbeJson;
  } catch {
    return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED };
  }
  const streams = parsed.streams ?? [];
  const video = pickVideo(streams);
  if (!video) {
    return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.NO_VIDEO_STREAM };
  }
  const width = video.width ?? 0;
  const height = video.height ?? 0;
  if (width <= 0 || height <= 0) {
    return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.INVALID_MEDIA_DIMENSIONS };
  }
  const audio = pickAudio(streams);
  const fps = parseFfprobeFrameRate(video.avg_frame_rate) ?? parseFfprobeFrameRate(video.r_frame_rate);
  const durationSec = parseDurationSec(parsed, video, audio);
  const frameCount = parsePositiveNumber(video.nb_frames);
  const sampleRate = audio ? parsePositiveNumber(audio.sample_rate) : undefined;
  const size = parsePositiveNumber(parsed.format?.size);
  return {
    ok: true,
    width,
    height,
    durationSec,
    fps,
    frameCount: frameCount != null ? Math.round(frameCount) : undefined,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name,
    hasAudio: Boolean(audio),
    sampleRate,
    channels: audio?.channels != null && Number.isFinite(audio.channels) && audio.channels > 0 ? audio.channels : undefined,
    fileSize: size != null ? Math.round(size) : undefined,
  };
}
