import { describe, expect, it } from 'vitest';
import { parseFfprobeJson } from '../../media/ffmpeg/ffprobe.js';
import {
  DETERMINISTIC_MEDIA_ERROR,
  parseAnalyzerFfprobeJson,
} from './parse-analyzer-ffprobe.js';

const silentVideo = {
  format: { duration: '35.107', size: '11383177' },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1040,
      avg_frame_rate: '30000/1001',
      r_frame_rate: '30000/1001',
    },
  ],
};

describe('parseAnalyzerFfprobeJson', () => {
  it('parses video plus audio', () => {
    const parsed = parseAnalyzerFfprobeJson(
      JSON.stringify({
        format: { duration: '8.04', size: '1000' },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1080,
            height: 1920,
            avg_frame_rate: '30/1',
          },
          { codec_type: 'audio', codec_name: 'aac', sample_rate: '44100', channels: 2 },
        ],
      }),
    );
    expect(parsed).toMatchObject({
      ok: true,
      width: 1080,
      height: 1920,
      hasAudio: true,
      fps: 30,
      audioCodec: 'aac',
      sampleRate: 44100,
      channels: 2,
    });
  });

  it('parses video without audio', () => {
    const parsed = parseAnalyzerFfprobeJson(JSON.stringify(silentVideo));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.hasAudio).toBe(false);
      expect(parsed.width).toBe(1920);
      expect(parsed.height).toBe(1040);
      expect(parsed.audioCodec).toBeUndefined();
      expect(parsed.fps).toBeCloseTo(30000 / 1001, 5);
    }
    expect(parseFfprobeJson(JSON.stringify(silentVideo))).toBeNull();
  });

  it('prefers default video and audio streams', () => {
    const parsed = parseAnalyzerFfprobeJson(
      JSON.stringify({
        format: { duration: '4' },
        streams: [
          { codec_type: 'video', codec_name: 'mpeg4', width: 320, height: 240, avg_frame_rate: '15/1' },
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            avg_frame_rate: '24/1',
            disposition: { default: 1 },
          },
          { codec_type: 'audio', codec_name: 'mp3', sample_rate: '22050', channels: 1 },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            sample_rate: '48000',
            channels: 2,
            disposition: { default: 1 },
          },
        ],
      }),
    );
    expect(parsed).toMatchObject({
      ok: true,
      videoCodec: 'h264',
      width: 1920,
      audioCodec: 'aac',
      sampleRate: 48000,
      channels: 2,
      fps: 24,
    });
  });

  it('uses stream duration when format duration is missing', () => {
    const parsed = parseAnalyzerFfprobeJson(
      JSON.stringify({
        format: {},
        streams: [{ codec_type: 'video', width: 100, height: 100, duration: '2.5', avg_frame_rate: '25/1' }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.durationSec).toBe(2.5);
    }
  });

  it('treats invalid fps as undefined', () => {
    const parsed = parseAnalyzerFfprobeJson(
      JSON.stringify({
        format: { duration: '1' },
        streams: [{ codec_type: 'video', width: 10, height: 10, avg_frame_rate: '0/0', r_frame_rate: 'n/a' }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.fps).toBeUndefined();
    }
  });

  it('returns NO_VIDEO_STREAM without video', () => {
    expect(
      parseAnalyzerFfprobeJson(JSON.stringify({ format: { duration: '1' }, streams: [{ codec_type: 'audio' }] })),
    ).toEqual({ ok: false, code: DETERMINISTIC_MEDIA_ERROR.NO_VIDEO_STREAM });
  });

  it('returns MEDIA_PROBE_FAILED on malformed json', () => {
    expect(parseAnalyzerFfprobeJson('not-json')).toEqual({
      ok: false,
      code: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED,
    });
  });

  it('leaves duration undefined when missing', () => {
    const parsed = parseAnalyzerFfprobeJson(
      JSON.stringify({
        format: {},
        streams: [{ codec_type: 'video', width: 64, height: 64, avg_frame_rate: '30/1' }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.durationSec).toBeUndefined();
    }
  });
});
