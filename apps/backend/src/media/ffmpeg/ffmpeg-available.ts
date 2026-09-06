import { spawnSync } from 'node:child_process';
import { ffmpegBin, ffprobeBin } from './ffmpeg-config.js';

export function isFfmpegAvailable(): boolean {
  return commandWorks(ffmpegBin()) && commandWorks(ffprobeBin());
}

export function isFfprobeAvailable(): boolean {
  return commandWorks(ffprobeBin());
}

function commandWorks(bin: string): boolean {
  try {
    const result = spawnSync(bin, ['-version'], { windowsHide: true, shell: false, timeout: 4_000 });
    return result.status === 0;
  } catch {
    return false;
  }
}
