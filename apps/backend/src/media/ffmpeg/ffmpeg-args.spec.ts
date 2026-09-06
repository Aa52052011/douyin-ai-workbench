import { describe, expect, it } from 'vitest';
import { allocateSceneDurations, buildFfmpegComposeArgs, escapeSubtitlesFilterPath } from './ffmpeg-args.js';

describe('ffmpeg args', () => {
  it('escapes Windows drive letters and backslashes for the subtitles filter', () => {
    expect(escapeSubtitlesFilterPath('C:\\temp\\captions.srt')).toBe(
      "subtitles=filename='C\\:/temp/captions.srt'",
    );
    expect(escapeSubtitlesFilterPath('D:/work/a,b.srt')).toBe(
      "subtitles=filename='D\\:/work/a\\,b.srt'",
    );
    expect(escapeSubtitlesFilterPath('C:\\Users\\Admin\\Local Temp\\captions.srt')).toBe(
      "subtitles=filename='C\\:/Users/Admin/Local Temp/captions.srt'",
    );
  });

  it('allocates scene durations that sum to the voice duration', () => {
    const durations = allocateSceneDurations([2, 6, 2], 8);
    const sum = durations.reduce((total, item) => total + item, 0);
    expect(Math.abs(sum - 8)).toBeLessThan(0.002);
    expect(durations).toHaveLength(3);
  });

  it('builds spawn argv without a shell string', () => {
    const args = buildFfmpegComposeArgs({
      scenes: [
        { path: '/tmp/scene-001.png', duration: 2 },
        { path: '/tmp/scene-002.png', duration: 6 },
      ],
      voicePath: '/tmp/voice.wav',
      subtitlePath: 'C:\\tmp\\captions.srt',
      outputPath: '/tmp/output.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      voiceDuration: 8,
    });
    expect(args[0]).toBe('-y');
    expect(args).toContain('-filter_complex');
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('yuv420p');
    expect(args.join(' ')).toContain("subtitles=filename='C\\:/tmp/captions.srt'");
    expect(args.join(' ')).not.toContain('ffmpeg ');
    expect(args.join(' ')).toContain('force_original_aspect_ratio=increase');
    expect(args.join(' ')).toContain('crop=1080:1920');
    expect(args.join(' ')).not.toContain('force_original_aspect_ratio=decrease');
    expect(args.join(' ')).not.toContain('pad=1080:1920');
  });
});
