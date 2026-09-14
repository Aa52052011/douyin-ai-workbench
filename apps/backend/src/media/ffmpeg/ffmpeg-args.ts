export function allocateSceneDurations(budgets: number[], voiceDuration: number): number[] {
  const safe = budgets.map((item) => Math.max(0.1, item));
  const total = safe.reduce((sum, item) => sum + item, 0);
  const durations = safe.map((item) => (item / total) * voiceDuration);
  const drift = voiceDuration - durations.reduce((sum, item) => sum + item, 0);
  durations[durations.length - 1] = Math.max(0.1, (durations.at(-1) ?? 0) + drift);
  return durations.map((item) => Math.round(item * 1000) / 1000);
}

export function escapeSubtitlesFilterPath(absPath: string): string {
  const unix = absPath.replace(/\\/g, '/');
  const escaped = unix
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;');
  // FFmpeg 9+ parses unquoted `subtitles=C\:/path` as filename=`C` + original_size=`/path`.
  // Named option + single quotes keep a Windows drive letter as one filename value.
  return `subtitles=filename='${escaped}'`;
}

export type FfmpegSceneClip = {
  path: string;
  duration: number;
  kind?: 'image' | 'video';
  sourceStartSec?: number;
  freezePadSec?: number;
  /** Fraction of source height to drop from the top before COVER (browser chrome). */
  cropTopRatio?: number;
};

export function buildFfmpegComposeArgs(input: {
  scenes: FfmpegSceneClip[];
  voicePath: string;
  subtitlePath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  voiceDuration: number;
}): string[] {
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const scene of input.scenes) {
    if (scene.kind === 'video') {
      if (scene.sourceStartSec && scene.sourceStartSec > 0) {
        args.push('-ss', String(scene.sourceStartSec));
      }
      const clipSec = Math.max(0.05, scene.duration - (scene.freezePadSec ?? 0));
      args.push('-t', String(clipSec), '-i', scene.path);
    } else {
      args.push('-loop', '1', '-t', String(scene.duration), '-i', scene.path);
    }
  }
  args.push('-i', input.voicePath);
  const filters: string[] = [];
  input.scenes.forEach((scene, index) => {
    const freeze =
      scene.kind === 'video' && scene.freezePadSec && scene.freezePadSec > 0
        ? `,tpad=stop_mode=clone:stop_duration=${scene.freezePadSec}`
        : '';
    filters.push(
      `[${index}:v]${coverFilter(input.width, input.height, scene.cropTopRatio)}${freeze},fps=${input.fps}[v${index}]`,
    );
  });
  const concatInputs = input.scenes.map((_, index) => `[v${index}]`).join('');
  filters.push(`${concatInputs}concat=n=${input.scenes.length}:v=1:a=0[vcat]`);
  filters.push(`[vcat]${escapeSubtitlesFilterPath(input.subtitlePath)}[vout]`);
  const audioIndex = input.scenes.length;
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    `${audioIndex}:a`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-t',
    String(input.voiceDuration),
    input.outputPath,
  );
  return args;
}

export function coverFilter(width: number, height: number, cropTopRatio = 0): string {
  const ratio = Math.min(0.35, Math.max(0, cropTopRatio));
  const preCrop =
    ratio > 0 ? `crop=iw:ih*(1-${ratio.toFixed(3)}):0:ih*${ratio.toFixed(3)},` : '';
  return `${preCrop}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}
