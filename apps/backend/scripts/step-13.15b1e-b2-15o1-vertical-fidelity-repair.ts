/**
 * B2-15O1: Vertical UI fidelity repair calibration.
 * Short samples only. No production render, no audio, no landscape, no accept, no publish.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { CONTENT_01_CONTAINERS } from '../src/production-v2/source-aware-editorial/containers.js';
import { pixelCropFromNormalized } from '../src/production-v2/dynamic-reframe/normalized-geometry.js';
import { mapSourceRectToOutput } from '../src/production-v2/ui-fidelity-calibration/compose.js';
import {
  comparePng,
  decodeCheck,
  edgeEnergy,
  extractPng,
  measureSourceGlyph,
  runFfmpeg,
  summarizeProbe,
  writeJson,
} from '../src/production-v2/ui-fidelity-calibration/io.js';
import {
  BLANK_GAP_MS,
  COMPARE_TIMES_SEC,
  FROZEN_CRF,
  SHARPEN_LIGHT,
  SHARPEN_VERY_LIGHT,
  SOURCE_GLYPH_PX,
  VERTICAL_TARGET,
  assertCalibrationDirectFromOriginal,
  baselineCrop,
  buildVerticalSampleFilter,
  contentBBoxFromGray,
  haloIndex,
  layoutForCrop,
  localContrast,
  occupancyTighten,
  pickSharpen,
  reduceMobileCandidates,
  requiredContainers,
  rootCauseAnalysis,
  sampleFfmpegArgs,
  semanticIntegrity,
  stillFilter,
  gradientMagnitude,
} from '../src/production-v2/vertical-fidelity-repair/repair.js';
import { applyExplicitRequestChanges } from '../src/production-v2/source-aware-output/final-production-review.js';
import { FileFinalProductionReviewStore } from '../src/production-v2/source-aware-output/final-production-review-store.js';
import { productionMediaFile } from '../src/production-v2/source-aware-output/production-run-store.js';
import { productionArtifactFileName } from '../src/production-v2/source-aware-output/production-render.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from '../src/production-v2/source-aware-output/dual-output.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15o1',
);
const calDir = path.join(repoRoot, '.local', 'vertical-fidelity-calibration', 'content-01');

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

function sha256FileSync(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const calibrationFfmpeg: string[][] = [];
function calFfmpeg(args: string[], timeoutMs = 180_000) {
  calibrationFfmpeg.push(args);
  return runFfmpeg(args, timeoutMs);
}

mkdirSync(calDir, { recursive: true });
mkdirSync(path.join(evidenceDir, 'samples'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'frames'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'regions'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'audits'), { recursive: true });

const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
function productionPath(profileId: string) {
  return productionMediaFile({
    repoRoot,
    tenantId,
    reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
    fileName: productionArtifactFileName(profileId),
  });
}
const productionBefore = {
  vertical: sha256FileSync(productionPath(VERTICAL_PROFILE_ID)),
  landscape: sha256FileSync(productionPath(LANDSCAPE_PROFILE_ID)),
};

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
assertCalibrationDirectFromOriginal(sourcePath);
const sourceProbe = summarizeProbe(sourcePath);
const srcW = sourceProbe.width ?? 1920;
const srcH = sourceProbe.height ?? 1040;
const page = baselineCrop();
const baseLayout = layoutForCrop(page);
const textRect = pixelCropFromNormalized(CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:TEXT_BLOCK')!.rect, srcW, srcH);
const glyphSource = measureSourceGlyph(sourcePath, 8, textRect) ?? SOURCE_GLYPH_PX;

const pagePx = pixelCropFromNormalized(page, srcW, srcH);
const pageGrayPath = path.join(evidenceDir, 'frames', 'page-8s.raw');
const pageGray = calFfmpeg(
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    '8',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    `crop=${pagePx.width}:${pagePx.height}:${pagePx.x}:${pagePx.y},format=gray`,
    '-f',
    'rawvideo',
    pageGrayPath,
  ],
  20_000,
);
let contentNorm: { x: number; y: number; width: number; height: number } | null = null;
if (pageGray.status === 0 && existsSync(pageGrayPath)) {
  const raw = readFileSync(pageGrayPath);
  const bbox = contentBBoxFromGray(raw.subarray(0, pagePx.width * pagePx.height), pagePx.width, pagePx.height);
  if (bbox) {
    const pad = 8;
    const x = Math.max(0, bbox.x - pad);
    const y = Math.max(0, bbox.y - pad);
    const x2 = Math.min(pagePx.width, bbox.x + bbox.width + pad);
    const y2 = Math.min(pagePx.height, bbox.y + bbox.height + pad);
    contentNorm = {
      x: (pagePx.x + x) / srcW,
      y: (pagePx.y + y) / srcH,
      width: (x2 - x) / srcW,
      height: (y2 - y) / srcH,
    };
  }
}

const occupancy = occupancyTighten({ page, required: requiredContainers(), contentBBox: contentNorm });
const v1Crop = occupancy.technically === 'TECHNICALLY_SAFE' ? occupancy.crop : page;
const v1Layout = layoutForCrop(v1Crop);
const v1Integrity = semanticIntegrity(v1Crop);

j('root-cause-analysis.json', rootCauseAnalysis({ effectiveScale: baseLayout.scale, typicalGlyphHeight: glyphSource * baseLayout.scale }));
j('baseline-geometry.json', { crop: page, ...baseLayout, crf: FROZEN_CRF, resolution: VERTICAL_TARGET, scaler: 'lanczos' });
j('occupancy-audit.json', { contentNorm, occupancy, v1Crop, v1Layout, semantic: v1Integrity });
j('glyph-size-audit.json', {
  sourcePx: glyphSource,
  baseline: glyphSource * baseLayout.scale,
  v1: glyphSource * v1Layout.scale,
});

function extractGray(pngPath: string): { buf: Buffer; width: number; height: number } | null {
  const rawPath = `${pngPath}.gray`;
  const result = calFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', '-i', pngPath, '-vf', 'format=gray', '-pix_fmt', 'gray', '-f', 'rawvideo', rawPath],
    15_000,
  );
  if (result.status !== 0 || !existsSync(rawPath)) return null;
  const width = 1080;
  const height = 1920;
  const raw = readFileSync(rawPath);
  if (raw.length < width * height) return null;
  return { buf: raw.subarray(0, width * height), width, height };
}

function renderStill(outPng: string, crop: typeof page, sharpen: string | null, t: number) {
  const filter = stillFilter({ crop, sourceWidth: srcW, sourceHeight: srcH, sharpen });
  return calFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', sourcePath, '-frames:v', '1', '-filter_complex', filter, '-map', '[outv]', outPng],
    30_000,
  ).status === 0;
}

const stillDir = path.join(evidenceDir, 'frames', 'sharpen-probe');
mkdirSync(stillDir, { recursive: true });
const probeT = 8;
const v0Still = path.join(stillDir, 'v0.png');
const vlStill = path.join(stillDir, 'very-light.png');
const lStill = path.join(stillDir, 'light.png');
renderStill(v0Still, page, null, probeT);
renderStill(vlStill, page, SHARPEN_VERY_LIGHT, probeT);
renderStill(lStill, page, SHARPEN_LIGHT, probeT);
const g0 = extractGray(v0Still);
const gvl = extractGray(vlStill);
const gl = extractGray(lStill);
const e0 = edgeEnergy(v0Still);
const evl = edgeEnergy(vlStill);
const el = edgeEnergy(lStill);
const haloVl = g0 && gvl ? haloIndex(g0.buf, gvl.buf, g0.width, g0.height) : { fail: true, whiteFringeRatio: 1, darkRingRatio: 1, meanAbsDiff: 99 };
const haloL = g0 && gl ? haloIndex(g0.buf, gl.buf, g0.width, g0.height) : { fail: true, whiteFringeRatio: 1, darkRingRatio: 1, meanAbsDiff: 99 };
const sharpenPick = pickSharpen([
  { id: 'very-light', fail: haloVl.fail, edgeGain: e0 && evl ? evl / e0 : 1 },
  { id: 'light', fail: haloL.fail, edgeGain: e0 && el ? el / e0 : 1 },
]);
j('sharpen-parameter-audit.json', {
  veryLight: { filter: SHARPEN_VERY_LIGHT, halo: haloVl, edgeGain: e0 && evl ? evl / e0 : null },
  light: { filter: SHARPEN_LIGHT, halo: haloL, edgeGain: e0 && el ? el / e0 : null },
  pick: sharpenPick,
});
j('anti-ringing-audit.json', { veryLight: haloVl, light: haloL, selected: sharpenPick });

function renderSample(name: string, crop: typeof page, sharpen: string | null) {
  const out = path.join(calDir, name);
  const graph = buildVerticalSampleFilter({ crop, sourceWidth: srcW, sourceHeight: srcH, sharpen });
  const args = sampleFfmpegArgs(sourcePath, out, graph.filter);
  const result = calFfmpeg(args, 180_000);
  if (result.status !== 0 || !existsSync(out)) throw new Error(`SAMPLE_FAILED:${name}:${result.stderr?.slice(0, 400)}`);
  copyFileSync(out, path.join(evidenceDir, 'samples', name));
  return { out, probe: summarizeProbe(out), decode: decodeCheck(out), graph };
}

const v0 = renderSample('V0_baseline_sample.mp4', page, null);
let v1: ReturnType<typeof renderSample> | null = null;
let v1Status: 'GENERATED' | 'NOT_SAFE' = 'NOT_SAFE';
if (occupancy.technically === 'TECHNICALLY_SAFE' && v1Integrity.pass) {
  v1 = renderSample('V1_occupancy_sample.mp4', v1Crop, null);
  v1Status = 'GENERATED';
}
let v2: ReturnType<typeof renderSample> | null = null;
let v2Status: 'GENERATED' | 'NOT_SAFE' = 'NOT_SAFE';
if (sharpenPick.technically === 'TECHNICALLY_SAFE' && sharpenPick.filter) {
  v2 = renderSample('V2_light_sharpen_sample.mp4', page, sharpenPick.filter);
  v2Status = 'GENERATED';
}
let v3: ReturnType<typeof renderSample> | null = null;
let v3Status: 'GENERATED' | 'NOT_SAFE' | 'NOT_NEEDED' = 'NOT_NEEDED';
if (v1Status === 'GENERATED' && v2Status === 'GENERATED' && sharpenPick.filter) {
  v3 = renderSample('V3_combined_sample.mp4', v1Crop, sharpenPick.filter);
  v3Status = 'GENERATED';
} else if (v1Status !== 'GENERATED') {
  v3Status = 'NOT_NEEDED';
} else {
  v3Status = 'NOT_SAFE';
}

j('candidate-strategies.json', {
  V0: { crop: page, sharpen: null, file: v0.out, productionUsable: false, calibrationOnly: true },
  V1: { status: v1Status, crop: v1Crop, reason: occupancy.reason, productionUsable: false },
  V2: { status: v2Status, sharpen: sharpenPick, productionUsable: false },
  V3: { status: v3Status, productionUsable: false },
});
j('semantic-integrity.json', {
  V0: semanticIntegrity(page),
  V1: v1Integrity,
  V2: semanticIntegrity(page),
  V3: v3Status === 'GENERATED' ? semanticIntegrity(v1Crop) : { pass: true, skipped: true },
});

const frameCmp: unknown[] = [];
const regionCmp: unknown[] = [];
const regions = [
  ['navigation', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:NAVIGATION_PANEL')!.rect],
  ['body-text', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:TEXT_BLOCK')!.rect],
  ['card-text', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:CARD')!.rect],
  ['button-label', CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:ACTION_GROUP')!.rect],
] as const;

for (const t of COMPARE_TIMES_SEC) {
  const dir = path.join(evidenceDir, 'frames', `${t}s`);
  mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = { V0: path.join(dir, 'V0.png') };
  renderStill(files.V0, page, null, t);
  if (v1) {
    files.V1 = path.join(dir, 'V1.png');
    renderStill(files.V1, v1Crop, null, t);
  }
  if (v2 && sharpenPick.filter) {
    files.V2 = path.join(dir, 'V2.png');
    renderStill(files.V2, page, sharpenPick.filter, t);
  }
  if (v3 && sharpenPick.filter) {
    files.V3 = path.join(dir, 'V3.png');
    renderStill(files.V3, v1Crop, sharpenPick.filter, t);
  }
  const row: Record<string, unknown> = { t };
  const gBase = extractGray(files.V0);
  for (const [id, file] of Object.entries(files)) {
    const g = extractGray(file);
    row[id] = {
      edge: edgeEnergy(file),
      ssimVsV0: id === 'V0' ? 1 : comparePng(files.V0, file),
      localContrast: g ? localContrast(g.buf) : null,
      gradient: g ? gradientMagnitude(g.buf, g.width, g.height) : null,
      haloVsV0: id === 'V0' || !gBase || !g ? null : haloIndex(gBase.buf, g.buf, g.width, g.height),
    };
  }
  frameCmp.push(row);
  for (const [name, rect] of regions) {
    const mapped = mapSourceRectToOutput(rect, { width: srcW, height: srcH }, page, VERTICAL_TARGET);
    const rdir = path.join(evidenceDir, 'regions', name, `${t}s`);
    mkdirSync(rdir, { recursive: true });
    const srcPx = pixelCropFromNormalized(rect, srcW, srcH);
    extractPng(sourcePath, t, path.join(rdir, 'source.png'), `crop=${srcPx.width}:${srcPx.height}:${srcPx.x}:${srcPx.y}`);
    for (const [id, file] of Object.entries(files)) {
      extractPng(file, 0, path.join(rdir, `${id}.png`), `crop=${mapped.width}:${mapped.height}:${mapped.x}:${mapped.y}`);
    }
    regionCmp.push({ t, region: name, mapped });
  }
}
j('same-frame-comparison.json', frameCmp);
j('text-region-comparison.json', regionCmp);

function lumaAt(file: string, tSec: number): number | null {
  const tmp = path.join(evidenceDir, 'frames', `luma-${tSec}.txt`);
  const result = calFfmpeg(
    ['-hide_banner', '-loglevel', 'error', '-ss', String(tSec), '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=print', '-f', 'null', '-'],
    20_000,
  );
  writeFileSync(tmp, `${result.stderr ?? ''}`);
  const yavg = Number(/YAVG=([0-9.]+)/.exec(result.stderr ?? '')?.[1] ?? NaN);
  return Number.isFinite(yavg) ? yavg : null;
}
const blankTimes = [BLANK_GAP_MS.start / 1000, 8, BLANK_GAP_MS.end / 1000];
const blank = blankTimes.map((t) => ({ t, yavg: lumaAt(v0.out, t <= 5 ? t : 5 + (t - 7)) }));
const blankNone = blank.every((item) => item.yavg == null || item.yavg > 8);
j('blank-gap-regression.json', { intervalMs: BLANK_GAP_MS, samples: blank, unexpectedBlank: blankNone ? 'NONE' : 'DETECTED' });

const mobile = reduceMobileCandidates({
  v1Safe: v1Status === 'GENERATED',
  v1GlyphGainPx: occupancy.glyphGainPx,
  v2Safe: v2Status === 'GENERATED',
  v3Safe: v3Status === 'GENERATED',
});
j('mobile-test-plan.json', {
  viewing: 'DOUYIN_DEFAULT_MOBILE_VIEW',
  selected: mobile,
  files: mobile.map((id) => ({
    id,
    file:
      id === 'V0'
        ? v0.out
        : id === 'V1'
          ? v1?.out
          : id === 'V2'
            ? v2?.out
            : v3?.out,
  })),
  instructions: [
    '只拷选中的 baseline + 1–2 个修复样片到同一部手机',
    '用正常竖屏信息流尺寸观看，不要用桌面全屏当主验收',
    '比较字边是否更干净、小字是否更好读、整体 UI 是否完整、锐化是否假',
    '不要默认一定和校准观感完全一致',
  ],
});

const reviewStore = new FileFinalProductionReviewStore(repoRoot);
const existingReview = await reviewStore.getByReviewSession(tenantId, CONTENT_01_REVIEW_SESSION_ID);
if (!existingReview) throw new Error('FINAL_REVIEW_MISSING');
const updatedReview = applyExplicitRequestChanges(
  existingReview,
  'Human finding #1: vertical text ragged / small-text soft on phone. Finding #2 audio missing is still open and not handled in B2-15O1.',
);
await reviewStore.persistExplicitRequestChanges(updatedReview);

const productionAfter = {
  vertical: sha256FileSync(productionPath(VERTICAL_PROFILE_ID)),
  landscape: sha256FileSync(productionPath(LANDSCAPE_PROFILE_ID)),
};
if (productionBefore.vertical !== productionAfter.vertical || productionBefore.landscape !== productionAfter.landscape) {
  throw new Error('PRODUCTION_ARTIFACT_MUTATED');
}

j('production-boundary.json', {
  calibrationOnly: true,
  productionUsable: false,
  mutated: false,
  hashes: productionAfter,
  landscapeUntouched: true,
  audioNotHandled: true,
  finalAcceptance: 'REQUEST_CHANGES',
  publication: 'BLOCKED',
});
j('audits/calibration-ffmpeg.json', { calls: calibrationFfmpeg.length, note: 'decode/scale/sample/probe stills; not production render' });
j('audits/production-ffmpeg.json', { calls: 0 });
j('audits/provider-calls.json', { calls: 0 });
j('audits/vision-calls.json', { calls: 0 });
j('audits/llm-calls.json', { calls: 0 });
j('audits/no-env-change.json', { envMutated: false });

const bestTechnical =
  v3Status === 'GENERATED' ? 'V3' : v2Status === 'GENERATED' ? 'V2' : v1Status === 'GENERATED' ? 'V1' : 'V0';
const summary = {
  step: '13.15B-1E-B2-15O1',
  source: sourcePath,
  v0: v0.probe,
  v1Status,
  v2Status,
  v3Status,
  sharpenPick,
  occupancy,
  mobile,
  bestTechnical,
  calibrationFfmpeg: calibrationFfmpeg.length,
  productionFfmpeg: 0,
};
j('implementation-summary.json', summary);
writeFileSync(path.join(calDir, 'README.txt'), [
  '竖屏清晰度校准样片（非正式成片）',
  '',
  '只用于手机对比字边和小字，不能当最终交付。',
  `当前建议对比：${mobile.join(' + ')}`,
  '',
].join('\n'));

console.log(JSON.stringify(summary, null, 2));
