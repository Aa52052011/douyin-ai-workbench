import { ffmpegMaxConcurrency } from './ffmpeg-config.js';

let active = 0;
const waiters: Array<() => void> = [];

export async function withFfmpegSlot<T>(fn: () => Promise<T>): Promise<T> {
  const max = ffmpegMaxConcurrency();
  if (active >= max) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}
