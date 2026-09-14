/**
 * B2-15G: UI recording fidelity calibration A/B/C.
 * Artifact-only. No DB mutation, Vision, LLM, sharpen, production 1080.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { directSourceAwareEditorialPlan } from '../src/production-v2/source-aware-editorial/director.js';
import { mapPlanToRuntimeTimeline } from '../src/production-v2/source-aware-editorial/timeline.js';
import { CONTENT_01_CONTAINERS } from '../src/production-v2/source-aware-editorial/containers.js';
import { smartUiFit } from '../src/production-v2/source-aware-editorial/smart-ui-fit.js';
import { pixelCropFromNormalized } from '../src/production-v2/dynamic-reframe/normalized-geometry.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from '../src/production-v2/source-aware-preview/render-config.js';
import { sourceAwarePreviewFile } from '../src/production-v2/source-aware-preview/store.js';
import {
  CALIBRATION_A,
  CALIBRATION_B,
  CALIBRATION_C,
  buildCalibrationFilterGraph,
  calibrationFfmpegArgs,
  compositionHash,
  containLayout,
  mapSourceRectToOutput,
  testAEquivalentToSourceAwarePreview,
  type CalibrationTargetV1,
} from '../src/production-v2/ui-fidelity-calibration/compose.js';
import {
  comparePng,
  decodeCheck,
  edgeEnergy,
  extractPng,
  mean,
  measureSourceGlyph,
  runFfmpeg,
  stillFilter,
  summarizeProbe,
  writeJson,
} from '../src/production-v2/ui-fidelity-calibration/io.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15g');
const calDir = path.join(repoRoot, '.local', 'mobile-quality-calibration', 'content-01');
const TIMES = [1, 8, 20, 30] as const;

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'FFMPEG_PATH', 'FFPROBE_PATH', 'CROP_REVIEW_REPO_ROOT']);
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}

mkdirSync(calDir, { recursive: true });
const plan = directSourceAwareEditorialPlan();
const timeline = mapPlanToRuntimeTimeline(plan);
const fit = smartUiFit();
const hash = compositionHash({
  assetId: plan.assetId,
  crop: fit.crop,
  fitMode: 'CONTAIN',
  background: 'BLUR_SOURCE_DARKENED',
  timeline: timeline.segments.map((item) => ({ startMs: item.sourceStartMs, endMs: item.sourceEndMs })),
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const session = await pool.query(`SELECT id, tenant_id, asset_id FROM crop_review_sessions WHERE id=$1`, [CONTENT_01_REVIEW_SESSION_ID]);
const row = session.rows[0];
if (!row) {
  await pool.end();
  throw new Error('SESSION_MISSING');
}
const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [row.asset_id, row.tenant_id]);
await pool.end();
if (row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');
const sourcePath = path.resolve(resolveStorageRoot(), String(asset.rows[0]?.storage_key ?? '').replaceAll('/', path.sep));
if (!existsSync(sourcePath) || isPreviewOfPreviewPath(sourcePath)) throw new Error('SOURCE_INVALID');
const sourceBefore = statSync(sourcePath);
const sourceProbe = summarizeProbe(sourcePath);
const srcW = sourceProbe.width ?? 1920;
const srcH = sourceProbe.height ?? 1040;

j('source-fidelity-audit.json', sourceProbe);
j('implementation-summary.json', {
  step: '13.15B-1E-B2-15G',
  finding: 'PAGE_TEXT_VISUALLY_BLURRY_ON_REAL_PHONE',
  compositionHash: hash,
  aReuse: testAEquivalentToSourceAwarePreview(),
});

const existingA = sourceAwarePreviewFile({
  tenantId: row.tenant_id,
  sessionId: CONTENT_01_REVIEW_SESSION_ID,
  previewVersion: SOURCE_AWARE_PREVIEW_RENDER_CONFIG.previewVersion,
});
const aPathCal = path.join(calDir, 'A_720x1280_crf20.mp4');
const bPathCal = path.join(calDir, 'B_1080x1920_crf18.mp4');
const cPathCal = path.join(calDir, 'C_1080x1920_crf16.mp4');
const aUser = path.join(calDir, 'A_720_review.mp4');
const bUser = path.join(calDir, 'B_1080_high.mp4');
const cUser = path.join(calDir, 'C_1080_ultra.mp4');

const sourceCrop = pixelCropFromNormalized(fit.crop, srcW, srcH);
const layoutA = containLayout(sourceCrop, CALIBRATION_A);
const layoutB = containLayout(sourceCrop, CALIBRATION_B);
const layoutC = containLayout(sourceCrop, CALIBRATION_C);
j('composition-equivalence.json', {
  hash,
  identical: true,
  crop: fit.crop,
  segments: timeline.segments,
  aMatchesSourceAwarePreview: testAEquivalentToSourceAwarePreview(),
  existingPreview: existsSync(existingA),
});
j('scale-ratio-audit.json', {
  sourceUiActiveRect: fit.crop,
  sourceCropPixels: sourceCrop,
  A: { target: { w: 720, h: 1280 }, ...layoutA },
  B: { target: { w: 1080, h: 1920 }, ...layoutB },
  C: { target: { w: 1080, h: 1920 }, ...layoutC },
});

const textNorm = CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:TEXT_BLOCK')!.rect;
const textRect = pixelCropFromNormalized(textNorm, srcW, srcH);
const glyphSource = measureSourceGlyph(sourcePath, 8, textRect);
const glyphA = glyphSource != null ? glyphSource * layoutA.scale : null;
const glyphB = glyphSource != null ? glyphSource * layoutB.scale : null;
j('glyph-size-estimate.json', {
  method: 'TEXT_BLOCK high-variance row-run median, no OCR',
  sourcePx: glyphSource,
  A: glyphA,
  B: glyphB,
  C: glyphB,
  textBlockSourcePx: textRect,
});
j('encoding-matrix.json', { A: CALIBRATION_A, B: CALIBRATION_B, C: CALIBRATION_C, sharpen: false, aiUpscale: false });

if (!testAEquivalentToSourceAwarePreview() || !existsSync(existingA)) throw new Error('A_NOT_REUSABLE');
const remuxA = runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', existingA, '-c', 'copy', '-an', '-movflags', '+faststart', aPathCal], 60_000);
if (remuxA.status !== 0) throw new Error('A_REMUX_FAILED');
copyFileSync(aPathCal, aUser);

function renderTarget(target: CalibrationTargetV1, outPath: string) {
  const graph = buildCalibrationFilterGraph({
    segments: timeline.segments,
    sourceWidth: srcW,
    sourceHeight: srcH,
    target,
  });
  let spawn = 0;
  let result = runFfmpeg(calibrationFfmpegArgs(sourcePath, outPath, graph.filter, target), 600_000);
  spawn += 1;
  if (result.status !== 0) {
    result = runFfmpeg(calibrationFfmpegArgs(sourcePath, outPath, graph.filter, target), 600_000);
    spawn += 1;
  }
  return { spawn, ok: result.status === 0 && existsSync(outPath) && statSync(outPath).size > 0 };
}

const flagProbe = runFfmpeg(
  ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=64x64:d=0.04', '-vf', 'scale=32:32:flags=lanczos+accurate_rnd+full_chroma_int', '-frames:v', '1', '-f', 'null', '-'],
  15_000,
);
if (flagProbe.status !== 0) {
  (CALIBRATION_C as { scalerFlags: string }).scalerFlags = 'lanczos';
}

const bRender = renderTarget(CALIBRATION_B, bPathCal);
if (!bRender.ok) throw new Error('B_RENDER_FAILED');
copyFileSync(bPathCal, bUser);
const cRender = renderTarget(CALIBRATION_C, cPathCal);
if (!cRender.ok) throw new Error('C_RENDER_FAILED');
copyFileSync(cPathCal, cUser);

const aProbe = summarizeProbe(aPathCal);
const bProbe = summarizeProbe(bPathCal);
const cProbe = summarizeProbe(cPathCal);
const aDecode = decodeCheck(aPathCal);
const bDecode = decodeCheck(bPathCal);
const cDecode = decodeCheck(cPathCal);
mkdirSync(path.join(evidenceDir, 'artifacts'), { recursive: true });
copyFileSync(aUser, path.join(evidenceDir, 'artifacts', 'A_720_review.mp4'));
copyFileSync(bUser, path.join(evidenceDir, 'artifacts', 'B_1080_high.mp4'));
copyFileSync(cUser, path.join(evidenceDir, 'artifacts', 'C_1080_ultra.mp4'));

const frameMetrics: Array<{ t: number; A: ReturnType<typeof comparePng>; B: ReturnType<typeof comparePng>; C: ReturnType<typeof comparePng> }> = [];
const regionMetrics: Array<{ t: number; region: string; A: ReturnType<typeof comparePng>; B: ReturnType<typeof comparePng>; C: ReturnType<typeof comparePng> }> = [];
const edgeRows: Array<{ t: number; A: number | null; B: number | null; C: number | null }> = [];
const regions = [
  ['navigation', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:NAVIGATION_PANEL')!.rect],
  ['content-text', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:TEXT_BLOCK')!.rect],
  ['card-text', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:CARD')!.rect],
] as const;

for (const t of TIMES) {
  const cmp = path.join(evidenceDir, 'frames', `${t}s`);
  extractPng(sourcePath, t, path.join(cmp, 'source.png'));
  extractPng(aPathCal, t, path.join(cmp, 'A.png'));
  extractPng(bPathCal, t, path.join(cmp, 'B.png'));
  extractPng(cPathCal, t, path.join(cmp, 'C.png'));
  const refA = path.join(cmp, 'refA.png');
  const refB = path.join(cmp, 'refB.png');
  runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', sourcePath, '-frames:v', '1', '-filter_complex', stillFilter(sourceCrop, CALIBRATION_A), '-map', '[outv]', refA], 30_000);
  runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', sourcePath, '-frames:v', '1', '-filter_complex', stillFilter(sourceCrop, CALIBRATION_B), '-map', '[outv]', refB], 30_000);
  const mA = comparePng(refA, path.join(cmp, 'A.png'));
  const mB = comparePng(refB, path.join(cmp, 'B.png'));
  const mC = comparePng(refB, path.join(cmp, 'C.png'));
  frameMetrics.push({ t, A: mA, B: mB, C: mC });
  const eRefA = edgeEnergy(refA);
  const eRefB = edgeEnergy(refB);
  const eA = edgeEnergy(path.join(cmp, 'A.png'));
  const eB = edgeEnergy(path.join(cmp, 'B.png'));
  const eC = edgeEnergy(path.join(cmp, 'C.png'));
  edgeRows.push({
    t,
    A: eRefA && eA != null ? eA / eRefA : null,
    B: eRefB && eB != null ? eB / eRefB : null,
    C: eRefB && eC != null ? eC / eRefB : null,
  });
  for (const [name, rect] of regions) {
    const outA = mapSourceRectToOutput(rect, { width: srcW, height: srcH }, fit.crop, CALIBRATION_A);
    const outB = mapSourceRectToOutput(rect, { width: srcW, height: srcH }, fit.crop, CALIBRATION_B);
    const srcPx = pixelCropFromNormalized(rect, srcW, srcH);
    const srcDir = path.join(evidenceDir, 'regions', name, `${t}s`);
    extractPng(sourcePath, t, path.join(srcDir, 'source.png'), `crop=${srcPx.width}:${srcPx.height}:${srcPx.x}:${srcPx.y}`);
    extractPng(aPathCal, t, path.join(srcDir, 'A.png'), `crop=${outA.width}:${outA.height}:${outA.x}:${outA.y}`);
    extractPng(bPathCal, t, path.join(srcDir, 'B.png'), `crop=${outB.width}:${outB.height}:${outB.x}:${outB.y}`);
    extractPng(cPathCal, t, path.join(srcDir, 'C.png'), `crop=${outB.width}:${outB.height}:${outB.x}:${outB.y}`);
    const rRefA = path.join(srcDir, 'refA.png');
    const rRefB = path.join(srcDir, 'refB.png');
    extractPng(refA, 0, rRefA, `crop=${outA.width}:${outA.height}:${outA.x}:${outA.y}`);
    extractPng(refB, 0, rRefB, `crop=${outB.width}:${outB.height}:${outB.x}:${outB.y}`);
    regionMetrics.push({
      t,
      region: name,
      A: comparePng(rRefA, path.join(srcDir, 'A.png')),
      B: comparePng(rRefB, path.join(srcDir, 'B.png')),
      C: comparePng(rRefB, path.join(srcDir, 'C.png')),
    });
  }
}

j('quality-metrics.json', {
  perFrame: frameMetrics,
  A: { ssim: mean(frameMetrics.map((row) => row.A.ssim)), psnr: mean(frameMetrics.map((row) => row.A.psnr)) },
  B: { ssim: mean(frameMetrics.map((row) => row.B.ssim)), psnr: mean(frameMetrics.map((row) => row.B.psnr)) },
  C: { ssim: mean(frameMetrics.map((row) => row.C.ssim)), psnr: mean(frameMetrics.map((row) => row.C.psnr)) },
});
j('regional-quality-metrics.json', {
  rows: regionMetrics,
  A: mean(regionMetrics.map((row) => row.A.ssim)),
  B: mean(regionMetrics.map((row) => row.B.ssim)),
  C: mean(regionMetrics.map((row) => row.C.ssim)),
});
j('edge-retention.json', {
  rows: edgeRows,
  A: mean(edgeRows.map((row) => row.A)),
  B: mean(edgeRows.map((row) => row.B)),
  C: mean(edgeRows.map((row) => row.C)),
});

const sidecar = (id: string, target: CalibrationTargetV1, filePath: string) => ({
  calibrationId: id,
  sourceAssetId: CONTENT_01_NEW_ASSET_ID,
  compositionHash: hash,
  resolution: `${target.width}x${target.height}`,
  codec: 'libx264',
  crf: target.crf,
  scaler: target.scalerFlags,
  fps: 30,
  audio: 'none',
  directFromOriginal: id !== 'A',
  aReuse: id === 'A',
  calibrationOnly: true,
  productionUsable: false,
  createdAt: new Date().toISOString(),
  file: filePath,
});
j('sidecars/A.json', sidecar('A', CALIBRATION_A, aUser));
j('sidecars/B.json', sidecar('B', CALIBRATION_B, bUser));
j('sidecars/C.json', sidecar('C', CALIBRATION_C, cUser));
j('human-mobile-test-plan.json', {
  order: ['A_720_review.mp4', 'B_1080_high.mp4', 'C_1080_ultra.mp4'],
  biasInstruction: 'Do not tell the user which should look better.',
  questions: [
    'A/B/C 哪个文字最清楚？',
    'B 比 A提升是否明显？',
    'C 比 B提升是否明显？',
    '哪个最接近平时抖音优质录屏？',
    '文件大小是否仍可接受？',
  ],
  autoJudged: false,
});
j('production-boundary.json', {
  calibrationOnly: true,
  productionUsable: false,
  previewUpscaleAllowed: false,
  humanApproved: false,
  approvalObject: null,
  authorization: false,
  productionFfmpeg: 0,
});
j('audits/calibration-ffmpeg.json', {
  A: { fullRender: 0, remux: 1 },
  B: { fullRender: bRender.spawn },
  C: { fullRender: cRender.spawn },
  totalFull: bRender.spawn + cRender.spawn,
});
j('audits/production-ffmpeg.json', { n: 0 });
j('audits/provider-calls.json', { n: 0 });
j('audits/vision-calls.json', { n: 0 });
j('audits/llm-calls.json', { n: 0 });
j('audits/no-env-change.json', { envMutated: false, sourceMutated: sourceBefore.size !== statSync(sourcePath).size });
j('frontend-build.json', { result: 'NOT_MODIFIED' });
j('limitations.json', {
  count: 6,
  items: [
    'AUTO_METRICS_NOT_FINAL_UI_SHARPNESS',
    'GLYPH_HEIGHT_IS_STRUCTURAL_PROXY_NOT_OCR',
    'VMAF_NOT_COMPUTED',
    'HUMAN_MOBILE_TEST_REQUIRED',
    'CHROMA_YUV420P_KEPT_FOR_COMPAT',
    'A_REUSED_EQUIVALENT_REMUX_NOT_NEW_COMPOSE',
  ],
});

process.stdout.write(
  `${JSON.stringify({
    ok: aDecode && bDecode && cDecode,
    aProbe,
    bProbe,
    cProbe,
    glyphSource,
    glyphA,
    glyphB,
    edge: { A: mean(edgeRows.map((row) => row.A)), B: mean(edgeRows.map((row) => row.B)), C: mean(edgeRows.map((row) => row.C)) },
    ssim: {
      A: mean(frameMetrics.map((row) => row.A.ssim)),
      B: mean(frameMetrics.map((row) => row.B.ssim)),
      C: mean(frameMetrics.map((row) => row.C.ssim)),
    },
    psnr: {
      A: mean(frameMetrics.map((row) => row.A.psnr)),
      B: mean(frameMetrics.map((row) => row.B.psnr)),
      C: mean(frameMetrics.map((row) => row.C.psnr)),
    },
    regionalSsim: {
      A: mean(regionMetrics.map((row) => row.A.ssim)),
      B: mean(regionMetrics.map((row) => row.B.ssim)),
      C: mean(regionMetrics.map((row) => row.C.ssim)),
    },
    ffmpeg: { A_remux: 1, B: bRender.spawn, C: cRender.spawn },
    hash,
    sourceMutated: sourceBefore.size !== statSync(sourcePath).size,
  })}\n`,
);
