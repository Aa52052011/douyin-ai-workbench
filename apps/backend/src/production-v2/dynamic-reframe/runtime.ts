import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { parseVideoOnlyFfprobe } from '../crop-review-flow/preview-runtime-plan.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { DYNAMIC_PREVIEW_RENDER_CONFIG as C } from './render-config.js';
import { loadFrozenDynamicPlan } from './plan-io.js';
import { validateDynamicPlan } from './plan-validator.js';
import { expandRuntimeShots, textFocusLargerThanContext } from './shot-split.js';
import { profileFromSource } from './normalized-geometry.js';
import { buildDynamicFilterGraph, ffmpegArgs } from './filter-builder.js';
import {
  dynamicPreviewConfigHash,
  dynamicPreviewFile,
  readDynamicSidecar,
  writeDynamicSidecar,
  type DynamicPreviewSidecarV1,
} from './store.js';
import type { DynamicReframePlanV1 } from './types.js';

export type DynamicRenderResult = {
  ok: boolean;
  code?: string;
  ffmpegSpawned: boolean;
  previewVersion: string;
  sidecar?: DynamicPreviewSidecarV1;
  bytes?: number;
};

async function probe(filePath: string) {
  const result = await runChildProcess(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 20_000 });
  return parseVideoOnlyFfprobe(result.stdout);
}

export async function renderDynamicPreview(input: {
  tenantId: string;
  sessionId: string;
  assetId: string;
  sourcePath: string;
  plan?: DynamicReframePlanV1;
}): Promise<DynamicRenderResult> {
  const plan = input.plan ?? loadFrozenDynamicPlan();
  if (plan.assetId !== input.assetId) return { ok: false, code: 'ASSET_MISMATCH', ffmpegSpawned: false, previewVersion: C.previewVersion };
  const valid = validateDynamicPlan(plan);
  if (!valid.ok) return { ok: false, code: valid.code, ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (!existsSync(input.sourcePath)) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (isPreviewOfPreviewPath(input.sourcePath)) {
    return { ok: false, code: 'PREVIEW_OF_PREVIEW_REJECTED', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const hash = dynamicPreviewConfigHash(plan);
  const loc = { tenantId: input.tenantId, sessionId: input.sessionId, previewVersion: C.previewVersion };
  const existing = readDynamicSidecar(loc);
  const outPath = dynamicPreviewFile(loc);
  if (existing?.status === 'READY' && existing.configHash === hash && existsSync(outPath) && statSync(outPath).size > 0) {
    return { ok: true, ffmpegSpawned: false, previewVersion: C.previewVersion, sidecar: existing, bytes: statSync(outPath).size };
  }
  const sourceProbe = await probe(input.sourcePath);
  if (!sourceProbe?.width || !sourceProbe.height || !sourceProbe.hasVideo) {
    return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const srcW = sourceProbe.width;
  const srcH = sourceProbe.height;
  const shots = expandRuntimeShots(plan, profileFromSource(srcW, srcH));
  if (!textFocusLargerThanContext(plan, shots)) {
    return { ok: false, code: 'KEY_TEXT_NOT_FOCUSED', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const graph = buildDynamicFilterGraph({ shots, sourceWidth: srcW, sourceHeight: srcH });
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tempPath = `${outPath}.tmp.mp4`;
  if (existsSync(tempPath)) unlinkSync(tempPath);
  const before = statSync(input.sourcePath);
  writeDynamicSidecar(loc, {
    schemaVersion: 'dynamic.preview-sidecar:v1',
    previewVersion: C.previewVersion,
    previewId: `pv:dynamic:${hash.slice(0, 12)}`,
    configHash: hash,
    assetId: input.assetId,
    sessionId: input.sessionId,
    dynamicPlanVersion: plan.schemaVersion,
    segmentCount: plan.segments.length,
    runtimeShotCount: shots.length,
    background: C.backgroundMode,
    reviewResolution: `${C.reviewWidth}x${C.reviewHeight}`,
    productionTargetResolution: `${C.productionWidth}x${C.productionHeight}`,
    productionSourcePolicy: C.productionSourcePolicy,
    productionDirectFromOriginal: true,
    previewUpscaleForProduction: false,
    productionUsable: false,
    audioPolicy: C.audioPolicy,
    scaler: C.scaler,
    crf: C.crf,
    createdAt: new Date().toISOString(),
    status: 'RENDERING',
    failureCode: null,
    durationMs: null,
    shotSplitApplied: shots.some((item) => item.shotSplit),
  });
  await runChildProcess(ffmpegBin(), ffmpegArgs(input.sourcePath, tempPath, graph.filter), { timeoutMs: C.timeoutMs });
  const after = statSync(input.sourcePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    return { ok: false, code: 'SOURCE_MUTATED', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  const probed = await probe(tempPath);
  if (!probed || probed.width !== C.reviewWidth || probed.height !== C.reviewHeight || probed.hasAudio) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    return { ok: false, code: 'OUTPUT_INVALID', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  renameSync(tempPath, outPath);
  const sidecar: DynamicPreviewSidecarV1 = {
    schemaVersion: 'dynamic.preview-sidecar:v1',
    previewVersion: C.previewVersion,
    previewId: `pv:dynamic:${hash.slice(0, 12)}`,
    configHash: hash,
    assetId: input.assetId,
    sessionId: input.sessionId,
    dynamicPlanVersion: plan.schemaVersion,
    segmentCount: plan.segments.length,
    runtimeShotCount: shots.length,
    background: C.backgroundMode,
    reviewResolution: `${C.reviewWidth}x${C.reviewHeight}`,
    productionTargetResolution: `${C.productionWidth}x${C.productionHeight}`,
    productionSourcePolicy: C.productionSourcePolicy,
    productionDirectFromOriginal: true,
    previewUpscaleForProduction: false,
    productionUsable: false,
    audioPolicy: C.audioPolicy,
    scaler: C.scaler,
    crf: C.crf,
    createdAt: new Date().toISOString(),
    status: 'READY',
    failureCode: null,
    durationMs: probed.durationMs,
    shotSplitApplied: shots.some((item) => item.shotSplit),
  };
  writeDynamicSidecar(loc, sidecar);
  return { ok: true, ffmpegSpawned: true, previewVersion: C.previewVersion, sidecar, bytes: statSync(outPath).size };
}
