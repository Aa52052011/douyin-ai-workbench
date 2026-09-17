import type { VideoRecord } from "./video.types";

export const VIDEO_POLL_INTERVAL_MS = 2000;
/** Real visual/TTS/FFmpeg pipelines exceed the previous ~3 minute UI wait. */
export const VIDEO_POLL_MAX_TICKS = 600;

export function isVideoPollTerminal(video: VideoRecord): boolean {
  if (video.status === "COMPLETED" || video.status === "FAILED") {
    return true;
  }
  const job = video.job?.status;
  return job === "COMPLETED" || job === "FAILED" || job === "CANCELLED";
}

export function isVideoPollActive(video: VideoRecord): boolean {
  return !isVideoPollTerminal(video);
}

export function createVideoPoller(options: {
  load: () => Promise<VideoRecord>;
  onUpdate: (video: VideoRecord) => void;
  onTimeout?: () => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
  maxTicks?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let ticks = 0;
  const intervalMs = options.intervalMs ?? VIDEO_POLL_INTERVAL_MS;
  const maxTicks = options.maxTicks ?? VIDEO_POLL_MAX_TICKS;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function stop() {
    stopped = true;
    clear();
  }

  function schedule() {
    clear();
    timer = setTimeout(() => {
      void tick();
    }, intervalMs);
  }

  async function tick() {
    if (stopped) {
      return;
    }
    ticks += 1;
    if (ticks > maxTicks) {
      stop();
      options.onTimeout?.();
      return;
    }
    try {
      const next = await options.load();
      if (stopped) {
        return;
      }
      options.onUpdate(next);
      if (isVideoPollTerminal(next)) {
        stop();
        return;
      }
      schedule();
    } catch (error) {
      if (stopped) {
        return;
      }
      options.onError?.(error);
      schedule();
    }
  }

  function start(initial?: VideoRecord) {
    stop();
    stopped = false;
    ticks = 0;
    if (initial && isVideoPollTerminal(initial)) {
      options.onUpdate(initial);
      return;
    }
    schedule();
  }

  return { start, stop };
}
