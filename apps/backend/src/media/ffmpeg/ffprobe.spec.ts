import { describe, expect, it } from 'vitest';
import { buildFfprobeArgs, parseFfprobeAudioDuration, parseFfprobeJson } from './ffprobe.js';

describe('ffprobe parser', () => {
  it('requires video, audio and a positive duration', () => {
    expect(
      parseFfprobeJson(
        JSON.stringify({
          format: { duration: '8.04' },
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 1080,
              height: 1920,
              avg_frame_rate: '30/1',
            },
            { codec_type: 'audio', codec_name: 'aac' },
          ],
        }),
      ),
    ).toMatchObject({
      duration: 8.04,
      hasVideo: true,
      hasAudio: true,
      width: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
    });
    expect(parseFfprobeAudioDuration(
      JSON.stringify({ format: { duration: '2.25' }, streams: [{ codec_type: 'audio' }] }),
    )).toBe(2.25);
    expect(parseFfprobeAudioDuration(JSON.stringify({ format: { duration: '2' }, streams: [] }))).toBeNull();
    expect(parseFfprobeJson('not-json')).toBeNull();
    expect(buildFfprobeArgs('/tmp/out.mp4')).toEqual([
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      '/tmp/out.mp4',
    ]);
  });
});
