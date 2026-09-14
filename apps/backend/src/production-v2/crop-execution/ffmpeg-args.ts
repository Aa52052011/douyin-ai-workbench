import type { FFmpegCropExecutionPlanV1, FFmpegExecutionArgsV1 } from './execution-plan.types.js';

export function buildFFmpegExecutionArgs(plan: FFmpegCropExecutionPlanV1): FFmpegExecutionArgsV1 {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    plan.inputPathRef,
    '-vf',
    plan.ffmpegFilterGraph,
    '-an',
    '-c:v',
    plan.codecPolicy,
    '-pix_fmt',
    plan.pixelFormat,
    plan.outputPathRef,
  ];
  return {
    binaryRef: 'ffmpeg',
    args,
    expectedOutput: plan.outputPathRef,
    mode: plan.mode,
  };
}
