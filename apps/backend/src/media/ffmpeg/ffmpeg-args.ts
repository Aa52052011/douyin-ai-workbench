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

export const SUBTITLE_FONT_SIZE = 10;
export const SUBTITLE_BOTTOM_OFFSET_CM = 1.5;
/** 9:16 成片按手机满屏观看时的画面物理高度参考，仅用于把 1.5cm 换成帧像素。 */
export const SUBTITLE_FRAME_PHYSICAL_HEIGHT_CM = 16;
/** ffmpeg/libass 将 SRT 转 ASS 时的默认 PlayRes（不是成片分辨率）。 */
export const SUBTITLE_LIBASS_PLAY_RES_X = 384;
export const SUBTITLE_LIBASS_PLAY_RES_Y = 288;
export const SUBTITLE_ASS_ALIGNMENT = 2;

export function subtitleBottomOffsetPx(frameHeight: number): number {
  const height = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 1920;
  return Math.max(1, Math.round((SUBTITLE_BOTTOM_OFFSET_CM / SUBTITLE_FRAME_PHYSICAL_HEIGHT_CM) * height));
}

export function subtitleMarginV(frameHeight: number): number {
  const height = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 1920;
  const videoPx = subtitleBottomOffsetPx(height);
  return Math.max(1, Math.round((videoPx * SUBTITLE_LIBASS_PLAY_RES_Y) / height));
}

export function subtitleBurnStyle(frameHeight: number): string {
  return `FontSize=${SUBTITLE_FONT_SIZE},Outline=1,Shadow=0,MarginV=${subtitleMarginV(frameHeight)},MarginL=64,MarginR=64,Alignment=${SUBTITLE_ASS_ALIGNMENT},BorderStyle=1`;
}

export function burnSubtitlesFilter(absPath: string, frameHeight = 1920): string {
  const style = subtitleBurnStyle(frameHeight).replace(/,/g, '\\,');
  return `${escapeSubtitlesFilterPath(absPath)}:force_style='${style}'`;
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
  filters.push(`[vcat]${burnSubtitlesFilter(input.subtitlePath, input.height)}[vout]`);
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
