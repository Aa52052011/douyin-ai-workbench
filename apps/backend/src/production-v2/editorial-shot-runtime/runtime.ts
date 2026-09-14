import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { parseVideoOnlyFfprobe } from '../crop-review-flow/preview-runtime-plan.js';
import { isPreviewOfPreviewPath } from '../crop-approval-persistence/preview-config.js';
import { compositionsMatch } from '../dynamic-reframe/normalized-geometry.js';
import { validateEditorialPlan } from '../editorial-shot-director/validator.js';
import type { EditorialShotPlanV1 } from '../editorial-shot-director/types.js';
import { EDITORIAL_PREVIEW_RENDER_CONFIG as C } from './render-config.js';
import { loadFrozenEditorialPlan } from './plan-io.js';
import { occupancyHierarchy } from './occupancy.js';
import { buildEditorialFilterGraph, editorialFfmpegArgs, mechanicalEasedMotion } from './filter-builder.js';
import { filterHasConcatGapRisk, ptsContinuity } from './continuity.js';
import {
  editorialPreviewConfigHash,
  editorialPreviewFile,
  readEditorialSidecar,
  writeEditorialSidecar,
  type EditorialPreviewSidecarV1,
} from './store.js';

export type EditorialRenderResult = {
  ok: boolean;
  code?: string;
  ffmpegSpawned: boolean;
  previewVersion: string;
  sidecar?: EditorialPreviewSidecarV1;
  bytes?: number;
};

async function probe(filePath: string) {
  const result = await runChildProcess(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 20_000 });
  return parseVideoOnlyFfprobe(result.stdout);
}

function counts(plan: EditorialShotPlanV1) {
  return {
    shotCount: plan.shots.length,
    wideCount: plan.shots.filter((item) => item.shotScale === 'WIDE_CONTEXT').length,
    mediumCount: plan.shots.filter((item) => item.shotScale === 'MEDIUM_FOCUS').length,
    detailCount: plan.shots.filter((item) => item.shotScale === 'DETAIL_READABLE').length,
  };
}

export async function renderEditorialPreview(input: {
  tenantId: string;
  sessionId: string;
  assetId: string;
  sourcePath: string;
  plan?: EditorialShotPlanV1;
}): Promise<EditorialRenderResult> {
  let plan: EditorialShotPlanV1;
  try {
    plan = input.plan ?? loadFrozenEditorialPlan();
  } catch (error) {
    return { ok: false, code: error instanceof Error ? error.message : 'PLAN_UNAVAILABLE', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (plan.assetId !== input.assetId) return { ok: false, code: 'ASSET_MISMATCH', ffmpegSpawned: false, previewVersion: C.previewVersion };
  const valid = validateEditorialPlan(plan);
  if (!valid.ok) return { ok: false, code: valid.code, ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (!existsSync(input.sourcePath)) return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  if (isPreviewOfPreviewPath(input.sourcePath)) {
    return { ok: false, code: 'PREVIEW_OF_PREVIEW_REJECTED', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (mechanicalEasedMotion(plan.shots)) {
    return { ok: false, code: 'MECHANICAL_MOTION', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const occupancy = occupancyHierarchy(plan.shots);
  if (!occupancy.ok) return { ok: false, code: 'OCCUPANCY_HIERARCHY_FAIL', ffmpegSpawned: false, previewVersion: C.previewVersion };
  for (const shot of plan.shots) {
    if (!compositionsMatch(shot.normalizedCrop, { width: 1920, height: 1040 }, { width: 720, height: 1280 }, { width: 1080, height: 1920 })) {
      return { ok: false, code: 'COMPOSITION_MISMATCH', ffmpegSpawned: false, previewVersion: C.previewVersion };
    }
  }
  const loc = { tenantId: input.tenantId, sessionId: input.sessionId, previewVersion: C.previewVersion };
  const outPath = editorialPreviewFile(loc);
  const sourceStat = statSync(input.sourcePath);
  const hash = editorialPreviewConfigHash(plan, { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs });
  const existing = readEditorialSidecar(loc);
  if (existing?.status === 'READY' && existing.configHash === hash && existsSync(outPath) && statSync(outPath).size > 0) {
    return { ok: true, ffmpegSpawned: false, previewVersion: C.previewVersion, sidecar: existing, bytes: statSync(outPath).size };
  }
  const sourceProbe = await probe(input.sourcePath);
  if (!sourceProbe?.width || !sourceProbe.height || !sourceProbe.hasVideo) {
    return { ok: false, code: 'PREVIEW_SOURCE_MISSING', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  const graph = buildEditorialFilterGraph({
    shots: plan.shots,
    sourceWidth: sourceProbe.width,
    sourceHeight: sourceProbe.height,
  });
  if (graph.easedShots > C.maxEasedShots) {
    return { ok: false, code: 'MECHANICAL_MOTION', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (filterHasConcatGapRisk(graph.filter)) {
    return { ok: false, code: 'CONCAT_DURATION_GUARD', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (!ptsContinuity(plan.shots.map((item) => ({ sourceStartMs: item.sourceStartMs, sourceEndMs: item.sourceEndMs }))).ok) {
    return { ok: false, code: 'PTS_DISCONTINUITY', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  if (plan.shots.some((item) => item.normalizedCrop.width * item.normalizedCrop.height < 0.02 && item.shotScale === 'DETAIL_READABLE')) {
    return { ok: false, code: 'EMPTY_PUNCH_IN_BLANK_RISK', ffmpegSpawned: false, previewVersion: C.previewVersion };
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tempPath = `${outPath}.tmp.mp4`;
  if (existsSync(tempPath)) unlinkSync(tempPath);
  const before = sourceStat;
  const tally = counts(plan);
  const pending = (status: EditorialPreviewSidecarV1['status'], failureCode: string | null): EditorialPreviewSidecarV1 => ({
    schemaVersion: 'editorial.preview-sidecar:v1',
    previewVersion: C.previewVersion,
    previewId: `pv:editorial:${hash.slice(0, 12)}`,
    configHash: hash,
    assetId: input.assetId,
    sessionId: input.sessionId,
    editorialPlanVersion: plan.schemaVersion,
    ...tally,
    reviewResolution: `${C.reviewWidth}x${C.reviewHeight}`,
    productionTargetResolution: `${C.productionWidth}x${C.productionHeight}`,
    productionSourcePolicy: C.productionSourcePolicy,
    productionDirectFromOriginal: true,
    previewUpscaleForProduction: false,
    previewUpscaleAllowed: false,
    productionUsable: false,
    backgroundPolicyVersion: plan.backgroundComposition.schemaVersion,
    transitionPolicy: 'CUT_HOLD_SHORT_EASED_ZOOM',
    audioPolicy: C.audioPolicy,
    scaler: C.scaler,
    crf: C.crf,
    createdAt: new Date().toISOString(),
    status,
    failureCode,
    durationMs: null,
  });
  writeEditorialSidecar(loc, pending('RENDERING', null));
  try {
    await runChildProcess(ffmpegBin(), editorialFfmpegArgs(input.sourcePath, tempPath, graph.filter), { timeoutMs: C.timeoutMs });
  } catch {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeEditorialSidecar(loc, pending('FAILED', 'FFMPEG_FAILED'));
    if (existsSync(outPath)) unlinkSync(outPath);
    return { ok: false, code: 'FFMPEG_FAILED', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  const after = statSync(input.sourcePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeEditorialSidecar(loc, pending('FAILED', 'SOURCE_MUTATED'));
    return { ok: false, code: 'SOURCE_MUTATED', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  const probed = await probe(tempPath);
  const expectedMs = plan.coverage.endMs - plan.coverage.startMs;
  if (
    !probed ||
    probed.width !== C.reviewWidth ||
    probed.height !== C.reviewHeight ||
    probed.hasAudio ||
    Math.abs((probed.durationMs ?? 0) - expectedMs) > 2500
  ) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    writeEditorialSidecar(loc, pending('FAILED', 'OUTPUT_INVALID'));
    if (existsSync(outPath)) unlinkSync(outPath);
    return { ok: false, code: 'OUTPUT_INVALID', ffmpegSpawned: true, previewVersion: C.previewVersion };
  }
  renameSync(tempPath, outPath);
  const sidecar: EditorialPreviewSidecarV1 = {
    ...pending('READY', null),
    durationMs: probed.durationMs,
  };
  writeEditorialSidecar(loc, sidecar);
  return { ok: true, ffmpegSpawned: true, previewVersion: C.previewVersion, sidecar, bytes: statSync(outPath).size };
}
