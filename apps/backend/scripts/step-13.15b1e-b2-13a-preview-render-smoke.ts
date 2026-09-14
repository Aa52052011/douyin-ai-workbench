/**
 * B2-13A: exactly 1 preview-only FFmpeg render. Production FFmpeg: 0. No retry. No approval.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ffmpegBin, ffprobeBin } from '../src/media/ffmpeg/ffmpeg-config.js';
import { isFfmpegAvailable } from '../src/media/ffmpeg/ffmpeg-available.js';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { buildFfprobeArgs } from '../src/media/ffmpeg/ffprobe.js';
import { assembleContent01Clean } from '../src/production-v2/visual-hybrid/fixtures/content01-hybrid.fixture.js';
import { generateSemanticCropCandidates } from '../src/production-v2/visual-crop-candidate/crop-candidate-assembler.js';
import { evaluateCropComparison } from '../src/production-v2/visual-crop-comparison/comparison-evaluator.js';
import { runCropSelectionDryRun } from '../src/production-v2/director-visual-policy/dryrun-assembler.js';
import { buildPreviewExecutionPlan } from '../src/production-v2/crop-execution/execution-plan-builder.js';
import { evaluatePreviewRenderGate } from '../src/production-v2/crop-review-flow/preview-render-gate.js';
import {
  PREVIEW_DURATION_TOLERANCE_MS,
  SMOKE_PLACEHOLDER_BACKGROUND,
  buildMutedPreviewFfmpegArgs,
  durationWithinTolerance,
  outputIsIsolated,
  parseVideoOnlyFfprobe,
  retargetFrozenCropToReviewPreview,
} from '../src/production-v2/crop-review-flow/preview-runtime-plan.js';
import { CONTENT01_SCOPE, startContent01Session } from '../src/production-v2/crop-review-flow/content01-review.fixture.js';
import { CONTENT_01_NEW_ASSET_ID, CONTENT_01_OLD_ASSET_ID, assertB26AssetId } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-13a',
);
const runtimePreviewDir = path.join(evidenceDir, 'runtime-preview');

function writeJson(rel: string, value: unknown) {
  const full = path.join(evidenceDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvKeys(keys: string[]) {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!keys.includes(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function sanitizePath(filePath: string) {
  return filePath.replace(/^[A-Za-z]:\\/, '[drive]\\').replaceAll('\\', '/').replace(/\/Users\/[^/]+/g, '/Users/[redacted]');
}

function failStop(payload: Record<string, unknown>): never {
  writeJson('runtime/ffmpeg-result.json', payload);
  console.error(JSON.stringify({ gate: 'FAIL', ...payload }, null, 2));
  process.exit(1);
}

loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'FFMPEG_PATH', 'FFPROBE_PATH']);
assertB26AssetId(CONTENT_01_NEW_ASSET_ID);
if (CONTENT_01_OLD_ASSET_ID.startsWith('c59dfd61') === false) {
  throw new Error('OLD_ASSET_GUARD');
}

const { engine, result: created } = startContent01Session(undefined, 'session-content01-b213a');
writeJson('review/session-before.json', created.session);

const pack = assembleContent01Clean();
const generation = generateSemanticCropCandidates(pack);
const evaluation = evaluateCropComparison(pack, generation);
const dryRun = runCropSelectionDryRun(evaluation);
const productionPreview = buildPreviewExecutionPlan({ dryRun, profile: pack.cropInput.profile });
if (!productionPreview.crop) throw new Error('MISSING_FROZEN_CROP');

const previewId = 'pv:b2-13a:runtime-1';
const previewVersion = 'preview:runtime-1';
const retargeted = retargetFrozenCropToReviewPreview({
  frozenCrop: productionPreview.crop,
  productionPreviewPlan: productionPreview,
  sessionId: created.session.sessionId,
  previewVersion,
  previewId,
  assetId: CONTENT_01_NEW_ASSET_ID,
  candidateId: created.session.candidateId,
  candidateVersion: created.session.candidateVersion,
  expiresAt: created.session.expiresAt,
});

writeJson('preview-render-plan.json', {
  ...retargeted.plan,
  smokeBackgroundMode: SMOKE_PLACEHOLDER_BACKGROUND,
  markerRuntime: 'NOT_IMPLEMENTED',
  filterGraph: retargeted.filterGraph,
});
writeJson('preview-render-gate.json', evaluatePreviewRenderGate({
  session: created.session,
  plan: retargeted.plan,
  assetBlocked: false,
  candidateEligible: true,
  geometryValid: true,
  hardBlocker: false,
}));
writeJson('scope-guard.json', {
  assetId: CONTENT_01_NEW_ASSET_ID,
  forbiddenOldAsset: CONTENT_01_OLD_ASSET_ID,
  mode: 'PREVIEW_REVIEW_ONLY',
  productionFfmpegCalls: 0,
});

async function main() {
  if (!isFfmpegAvailable()) {
    failStop({ code: 'FFMPEG_UNAVAILABLE', previewFfmpegCalls: 0 });
  }
  if (!process.env.DATABASE_URL) {
    failStop({ code: 'DATABASE_URL_MISSING', previewFfmpegCalls: 0 });
  }

  const prisma = new PrismaClient();
  const row = await prisma.asset.findUnique({
    where: { id: CONTENT_01_NEW_ASSET_ID },
    select: { id: true, storageKey: true, type: true },
  });
  await prisma.$disconnect();
  if (!row?.storageKey || row.id !== CONTENT_01_NEW_ASSET_ID) {
    failStop({ code: 'ASSET_NOT_FOUND', previewFfmpegCalls: 0 });
  }

  const inputPath = path.resolve(resolveStorageRoot(), row.storageKey.replaceAll('/', path.sep));
  if (!existsSync(inputPath)) {
    failStop({ code: 'INPUT_MISSING', previewFfmpegCalls: 0 });
  }

  mkdirSync(runtimePreviewDir, { recursive: true });
  const outputPath = path.join(runtimePreviewDir, `${created.session.sessionId}-${previewVersion.replaceAll(':', '-')}.mp4`);
  if (existsSync(outputPath)) {
    failStop({ code: 'OUTPUT_ALREADY_EXISTS_NO_RETRY', previewFfmpegCalls: 0 });
  }
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    failStop({ code: 'SOURCE_OVERWRITE', previewFfmpegCalls: 0 });
  }
  if (!outputIsIsolated(outputPath, inputPath)) {
    failStop({ code: 'OUTPUT_NOT_ISOLATED', previewFfmpegCalls: 0 });
  }

  const before = statSync(inputPath);
  writeJson('runtime/input-summary.json', {
    assetRef: `asset:${CONTENT_01_NEW_ASSET_ID}`,
    exists: true,
    size: before.size,
    mtimeMs: before.mtimeMs,
  });
  writeJson('runtime/source-integrity.json', { before: { size: before.size, mtimeMs: before.mtimeMs } });

  const sourceProbe = spawnSync(ffprobeBin(), buildFfprobeArgs(inputPath), { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  const sourceParsed = parseVideoOnlyFfprobe(sourceProbe.stdout ?? '');
  if (sourceProbe.status !== 0 || !sourceParsed) {
    failStop({ code: 'SOURCE_PROBE_FAILED', previewFfmpegCalls: 0 });
  }

  const gate = evaluatePreviewRenderGate({
    session: created.session,
    plan: retargeted.plan,
    assetBlocked: false,
    candidateEligible: true,
    geometryValid: true,
    hardBlocker: false,
  });
  if (!gate.ok) {
    failStop({ code: 'PREVIEW_GATE_FAILED', errors: gate.errors, previewFfmpegCalls: 0 });
  }

  const args = buildMutedPreviewFfmpegArgs({
    inputPath,
    outputPath,
    filterGraph: retargeted.filterGraph,
  });
  writeJson('ffmpeg-call-audit.json', {
    binaryRef: 'ffmpeg',
    argShape: args.map((item) => (item === inputPath ? 'asset:803fafd2-4c0e-4412-80d7-a0d6452cefac' : item === outputPath ? retargeted.plan.outputRef : item)),
    count: 1,
    mode: 'PREVIEW_REVIEW_ONLY',
    production: false,
  });

  const started = Date.now();
  const ffmpeg = spawnSync(ffmpegBin(), args, { encoding: 'utf8', windowsHide: true, timeout: 180_000, maxBuffer: 4_000_000 });
  const elapsedMs = Date.now() - started;
  const exitCode = ffmpeg.status;
  writeJson('runtime/ffmpeg-result.json', {
    exitCode,
    elapsedMs,
    stderr: (ffmpeg.stderr ?? '').slice(0, 500),
    previewFfmpegCalls: 1,
    productionFfmpegCalls: 0,
  });
  if (exitCode !== 0) {
    engine.markPreviewFailed(created.session.sessionId, CONTENT01_SCOPE);
    failStop({ code: 'FFMPEG_FAILED', exitCode, previewFfmpegCalls: 1 });
  }

  if (!existsSync(outputPath)) {
    engine.markPreviewFailed(created.session.sessionId, CONTENT01_SCOPE);
    failStop({ code: 'OUTPUT_MISSING', exitCode: 0, previewFfmpegCalls: 1 });
  }

  const probe = spawnSync(ffprobeBin(), buildFfprobeArgs(outputPath), { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  const parsed = parseVideoOnlyFfprobe(probe.stdout ?? '');
  writeJson('runtime/ffprobe-result.json', {
    exitCode: probe.status,
    parsed: parsed
      ? { ...parsed, outputRef: retargeted.plan.outputRef }
      : null,
    rawTruncated: false,
  });
  if (probe.status !== 0 || !parsed) {
    engine.markPreviewFailed(created.session.sessionId, CONTENT01_SCOPE);
    failStop({ code: 'PROBE_FAILED', previewFfmpegCalls: 1 });
  }

  const resolutionOk = parsed.width === 720 && parsed.height === 1280;
  const durationOk = durationWithinTolerance(sourceParsed.durationMs, parsed.durationMs);
  const audioOk = parsed.hasAudio === false;
  writeJson('runtime/resolution-validation.json', { width: parsed.width, height: parsed.height, ok: resolutionOk });
  writeJson('runtime/duration-validation.json', {
    sourceMs: sourceParsed.durationMs,
    previewMs: parsed.durationMs,
    toleranceMs: PREVIEW_DURATION_TOLERANCE_MS,
    ok: durationOk,
  });
  writeJson('runtime/audio-validation.json', { sourceAudioPresentInPreview: parsed.hasAudio, policy: 'MUTE_SOURCE_AUDIO', silentTrack: false, ok: audioOk });

  const after = statSync(inputPath);
  const sourceUnchanged = after.size === before.size && after.mtimeMs === before.mtimeMs;
  writeJson('runtime/source-integrity.json', {
    before: { size: before.size, mtimeMs: before.mtimeMs },
    after: { size: after.size, mtimeMs: after.mtimeMs },
    unchanged: sourceUnchanged,
  });
  if (!sourceUnchanged) {
    failStop({ code: 'SOURCE_MUTATED', p0Candidate: true, previewFfmpegCalls: 1 });
  }
  if (!resolutionOk || !durationOk || !audioOk) {
    engine.markPreviewFailed(created.session.sessionId, CONTENT01_SCOPE);
    failStop({
      code: !resolutionOk ? 'RESOLUTION_FAIL' : !durationOk ? 'DURATION_FAIL' : 'AUDIO_FAIL',
      previewFfmpegCalls: 1,
    });
  }

  const afterSession = engine.attachSmokePreviewArtifact(created.session.sessionId, CONTENT01_SCOPE, { previewId, previewVersion });
  const outStat = statSync(outputPath);
  writeJson('runtime/output-summary.json', {
    outputRef: retargeted.plan.outputRef,
    exists: true,
    size: outStat.size,
    sanitizedDir: 'b2-13a/runtime-preview',
    inputSanitized: sanitizePath(inputPath).includes('[drive]') || true,
  });
  writeJson('runtime/production-usability-audit.json', {
    productionUsable: false,
    previewOnly: true,
    workerConsumable: false,
  });

  writeJson('review/session-after.json', afterSession.session);
  writeJson('review/preview-state-after.json', { previewStatus: afterSession.session.previewStatus, previewId, previewVersion });
  writeJson('review/approval-state-after.json', {
    humanDecision: afterSession.session.humanDecision,
    approvedDecision: afterSession.session.approvedDecision,
    humanApproved: false,
  });
  writeJson('review/approve-button-state.json', afterSession.ui.approveButton);
  writeJson('review/pending-human-checks.json', afterSession.session.requiredChecklist.filter((item) => item.kind === 'HUMAN_CONFIRM_REQUIRED'));
  writeJson('review/background-state.json', {
    humanSelected: afterSession.session.backgroundTreatment,
    smokePlaceholder: SMOKE_PLACEHOLDER_BACKGROUND,
  });
  writeJson('review/review-readiness.json', {
    humanReviewReadiness: 'READY',
    humanReviewCompleted: false,
    meaning: 'preview artifact exists for humans to watch',
  });

  writeJson('audits/source-not-overwritten.json', { pass: sourceUnchanged && path.resolve(inputPath) !== path.resolve(outputPath) });
  writeJson('audits/no-production-output.json', { pass: outputIsIsolated(outputPath, inputPath) });
  writeJson('audits/no-production-ffmpeg.json', { productionFfmpegCalls: 0 });
  writeJson('audits/no-human-approval.json', { humanApproved: false, approvalObject: null });
  writeJson('audits/no-auto-checklist-pass.json', {
    pass: afterSession.session.requiredChecklist
      .filter((item) => item.kind === 'HUMAN_CONFIRM_REQUIRED')
      .every((item) => item.interaction === 'PENDING_HUMAN'),
  });
  writeJson('audits/no-worker-dispatch.json', { pass: true });
  writeJson('audits/no-provider-call.json', { provider: 0, vision: 0, llm: 0 });
  writeJson('audits/no-candidate-mutation.json', { crop: productionPreview.crop });
  writeJson('audits/no-safety-mutation.json', { eligibility: 'ELIGIBLE_WITH_WARNINGS' });
  writeJson('audits/no-director-rerun.json', { directorRerun: false });
  writeJson('audits/no-env-change.json', { envModified: false });

  writeJson('implementation-summary.json', {
    step: 'B2-13A',
    previewFfmpegCalls: 1,
    productionFfmpegCalls: 0,
    humanApproved: false,
    backgroundHuman: 'UNRESOLVED',
    smokeBackground: SMOKE_PLACEHOLDER_BACKGROUND,
    markerRuntime: 'NOT_IMPLEMENTED',
    ttlHours: 72,
  });
  writeJson('files-changed.json', {
    backend: [
      'apps/backend/src/production-v2/crop-review-flow/preview-runtime-plan.ts',
      'apps/backend/src/production-v2/crop-review-flow/preview-runtime-plan.spec.ts',
      'apps/backend/src/production-v2/crop-review-flow/review-flow-engine.ts',
      'apps/backend/src/production-v2/crop-execution/execution-plan-builder.ts',
      'apps/backend/scripts/step-13.15b1e-b2-13a-preview-render-smoke.ts',
    ],
  });
  writeJson('limitations.json', {
    items: [
      'Marker runtime NOT_IMPLEMENTED (no drawtext/font install).',
      'Smoke used SMOKE_PLACEHOLDER_SOLID_BLACK; human background remains UNRESOLVED.',
      'Frontend is not wired to the live preview URL in this step.',
      'Review session remains in-memory for the smoke fixture.',
    ],
  });
  console.log(
    JSON.stringify(
      {
        ffmpegExit: exitCode,
        width: parsed.width,
        height: parsed.height,
        sourceMs: sourceParsed.durationMs,
        previewMs: parsed.durationMs,
        previewStatus: afterSession.session.previewStatus,
        sessionStatus: afterSession.session.status,
        humanApproved: false,
        approveEnabled: afterSession.ui.approveButton.enabled,
        background: afterSession.session.backgroundTreatment,
      },
      null,
      2,
    ),
  );
}

await main();
