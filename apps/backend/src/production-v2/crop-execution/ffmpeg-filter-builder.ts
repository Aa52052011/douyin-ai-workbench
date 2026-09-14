import type { FFmpegCropExecutionPlanV1 } from './execution-plan.types.js';

export function buildCropExecutionFilterGraph(plan: FFmpegCropExecutionPlanV1): string {
  const parts: string[] = [];
  if (plan.crop) {
    parts.push(`crop=${plan.crop.width}:${plan.crop.height}:${plan.crop.x}:${plan.crop.y}`);
  }
  parts.push(`scale=${plan.scale.width}:${plan.scale.height}:force_original_aspect_ratio=disable`);
  if (plan.pad?.enabled) {
    const color = plan.pad.backgroundTreatment === 'UNRESOLVED' ? 'black' : plan.pad.backgroundTreatment === 'SOLID' ? 'black' : 'black';
    parts.push(`pad=${plan.pad.width}:${plan.pad.height}:${plan.pad.x}:${plan.pad.y}:${color}`);
  }
  parts.push('setsar=1');
  return parts.join(',');
}

export function assertNoNonUniformStretch(plan: FFmpegCropExecutionPlanV1): void {
  const srcW = plan.crop?.width ?? plan.source.width;
  const srcH = plan.crop?.height ?? plan.source.height;
  const sx = plan.scale.width / srcW;
  const sy = plan.scale.height / srcH;
  const pixelDrift = Math.abs(sx - sy) * Math.min(srcW, srcH);
  if (pixelDrift > 2 + 1e-6) {
    throw new Error('NON_UNIFORM_STRETCH');
  }
}
