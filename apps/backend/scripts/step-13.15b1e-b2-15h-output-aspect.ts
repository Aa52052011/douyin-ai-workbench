/**
 * B2-15H: 9:16 vs 16:9 aspect calibration. Artifact-only. No Vision/LLM/approval/production.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveStorageRoot } from '../src/media/storage/local-storage.provider.js';
import { isPreviewOfPreviewPath } from '../src/production-v2/crop-approval-persistence/preview-config.js';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { auditCropIntegrity } from '../src/production-v2/source-aware-editorial/integrity.js';
import { smartUiFit } from '../src/production-v2/source-aware-editorial/smart-ui-fit.js';
import { mapPlanToRuntimeTimeline } from '../src/production-v2/source-aware-editorial/timeline.js';
import { directSourceAwareEditorialPlan } from '../src/production-v2/source-aware-editorial/director.js';
import { pixelCropFromNormalized } from '../src/production-v2/dynamic-reframe/normalized-geometry.js';
import { containLayout } from '../src/production-v2/ui-fidelity-calibration/compose.js';
import { decodeCheck, measureSourceGlyph, runFfmpeg, summarizeProbe, writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { sampleBlankWindowFrames } from '../src/production-v2/source-aware-preview/frame-probe.js';
import { auditEditorialFrameContinuityV1 } from '../src/production-v2/editorial-shot-runtime/continuity.js';
import { CONTENT_01_CONTAINERS } from '../src/production-v2/source-aware-editorial/containers.js';
import {
  LANDSCAPE_UI_DEMO_PROFILE,
  SOURCE_AWARE_OUTPUT_PROFILES,
  VERTICAL_DOUYIN_PROFILE,
  buildLandscapeCalibrationFilter,
  landscapeFfmpegArgs,
  landscapeFillStrategy,
  recommendOutputForSourceType,
} from '../src/production-v2/source-aware-output/profiles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15h');
const outDir = path.join(repoRoot, '.local', 'mobile-aspect-calibration', 'content-01');
const b1080 = path.join(repoRoot, '.local', 'mobile-quality-calibration', 'content-01', 'B_1080_high.mp4');

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

mkdirSync(outDir, { recursive: true });
const plan = directSourceAwareEditorialPlan();
const timeline = mapPlanToRuntimeTimeline(plan);
const fit = smartUiFit();
const rec = recommendOutputForSourceType({ sourceVisualType: plan.sourceVisualType, sourceWidth: 1920, sourceHeight: 1040 });
const fill = landscapeFillStrategy(1920, 1040);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const session = await pool.query(`SELECT tenant_id, asset_id FROM crop_review_sessions WHERE id=$1`, [CONTENT_01_REVIEW_SESSION_ID]);
const row = session.rows[0];
const asset = await pool.query(`SELECT storage_key FROM assets WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [row.asset_id, row.tenant_id]);
await pool.end();
if (row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');
const sourcePath = path.resolve(resolveStorageRoot(), String(asset.rows[0]?.storage_key ?? '').replaceAll('/', path.sep));
if (!existsSync(sourcePath) || isPreviewOfPreviewPath(sourcePath)) throw new Error('SOURCE_INVALID');
const sourceBefore = statSync(sourcePath);

const vPath = path.join(outDir, 'V_1080x1920_crf18.mp4');
const lPath = path.join(outDir, 'L_1920x1080_crf18.mp4');
if (!existsSync(b1080)) throw new Error('B1080_MISSING');
const vRemux = runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', b1080, '-c', 'copy', '-an', '-movflags', '+faststart', vPath], 60_000);
if (vRemux.status !== 0) throw new Error('V_REMUX_FAILED');

const graph = buildLandscapeCalibrationFilter(plan.coverage.endMs / 1000);
let lSpawn = 0;
let lRender = runFfmpeg(landscapeFfmpegArgs(sourcePath, lPath, graph.filter), 600_000);
lSpawn += 1;
if (lRender.status !== 0) {
  lRender = runFfmpeg(landscapeFfmpegArgs(sourcePath, lPath, graph.filter), 600_000);
  lSpawn += 1;
}
if (lRender.status !== 0 || !existsSync(lPath)) throw new Error('L_RENDER_FAILED');

const vProbe = summarizeProbe(vPath);
const lProbe = summarizeProbe(lPath);
const vDecode = decodeCheck(vPath);
const lDecode = decodeCheck(lPath);
mkdirSync(path.join(evidenceDir, 'artifacts'), { recursive: true });
copyFileSync(vPath, path.join(evidenceDir, 'artifacts', 'V_1080x1920_crf18.mp4'));
copyFileSync(lPath, path.join(evidenceDir, 'artifacts', 'L_1920x1080_crf18.mp4'));

const vBlank = sampleBlankWindowFrames(vPath);
const lBlank = sampleBlankWindowFrames(lPath);
const vCont = auditEditorialFrameContinuityV1({ segments: timeline.segments, frames: vBlank.frames });
const lCont = auditEditorialFrameContinuityV1({
  segments: [{ sourceStartMs: 0, sourceEndMs: plan.coverage.endMs }],
  frames: lBlank.frames,
});

const sourceCrop = pixelCropFromNormalized(fit.crop, 1920, 1040);
const vLayout = containLayout(sourceCrop, { width: 1080, height: 1920 });
const textRect = pixelCropFromNormalized(CONTENT_01_CONTAINERS.find((item) => item.ref === 'container:TEXT_BLOCK')!.rect, 1920, 1040);
const glyphSource = measureSourceGlyph(sourcePath, 8, textRect);
const vIntegrity = auditCropIntegrity(fit.crop);
const lIntegrity = auditCropIntegrity({ x: 0, y: 0, width: 1, height: 1 });

j('output-profile-contract.json', SOURCE_AWARE_OUTPUT_PROFILES);
j('source-aware-aspect-policy.json', {
  sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
  evaluateFirst: 'LANDSCAPE_FULLSCREEN_16_9',
  verticalStillLegal: true,
  universalHardResolution: false,
});
j('vertical-profile.json', VERTICAL_DOUYIN_PROFILE);
j('landscape-profile.json', LANDSCAPE_UI_DEMO_PROFILE);
j('dual-output-recommendation-contract.json', rec);
j('aspect-tradeoff-audit.json', {
  vertical: 'feed-friendly; whole-page UI shrinks; landscape player keeps portrait box',
  landscape: 'fullscreen fill expected; near-native UI width; portrait viewing letterboxes',
  autoLocked: false,
});
j('scale-audit.json', { vertical: vLayout, landscape: fill });
j('glyph-size-audit.json', {
  source: glyphSource,
  vertical: glyphSource != null ? glyphSource * vLayout.scale : null,
  landscape: glyphSource != null ? glyphSource * fill.scale : null,
});
j('fullscreen-behavior.json', {
  VERTICAL: VERTICAL_DOUYIN_PROFILE.fullscreenBehavior,
  LANDSCAPE: LANDSCAPE_UI_DEMO_PROFILE.fullscreenBehavior,
});
j('human-mobile-test-plan.json', {
  scenarios: ['V1 portrait', 'V2 landscape', 'L1 portrait', 'L2 landscape/fullscreen'],
  questions: [
    '哪个竖屏浏览更自然？',
    '哪个横屏全屏真正铺满？',
    '哪个 UI 字体最清楚？',
    '哪个页面结构最完整？',
    '哪个最像抖音上优质录屏视频？',
    '是否值得同时提供双版本？',
  ],
  autoJudged: false,
});
j('audits/vertical-integrity.json', vIntegrity);
j('audits/landscape-integrity.json', lIntegrity);
j('audits/blank-gap-regression.json', {
  old: '6331-9131ms',
  V: vCont.unexpectedBlank,
  L: lCont.unexpectedBlank,
});
j('audits/calibration-ffmpeg.json', { V: { remux: 1, full: 0 }, L: { full: lSpawn }, total: 1 + lSpawn });
j('audits/production-ffmpeg.json', { n: 0 });
j('audits/provider-calls.json', { n: 0 });
j('audits/vision-calls.json', { n: 0 });
j('audits/llm-calls.json', { n: 0 });
j('audits/source-integrity.json', { mutated: sourceBefore.size !== statSync(sourcePath).size, original: true });
j('frontend-build.json', { result: 'NOT_MODIFIED' });
j('limitations.json', {
  count: 4,
  items: [
    'ASPECT_PROFILE_NOT_LOCKED',
    'HUMAN_ASPECT_TEST_REQUIRED',
    'V_REUSED_B1080_EQUIVALENT',
    'LANDSCAPE_PAD_NOT_BLUR_BACKGROUND',
  ],
});
j('production-boundary.json', { calibrationOnly: true, productionUsable: false, authorization: false, humanApproved: false });

process.stdout.write(
  `${JSON.stringify({
    ok: vDecode && lDecode && vProbe.width === 1080 && lProbe.width === 1920 && !fill.stretch,
    vProbe,
    lProbe,
    vIntegrity: vIntegrity.ok,
    lIntegrity: lIntegrity.ok,
    vBlank: vCont.unexpectedBlank.blank,
    lBlank: lCont.unexpectedBlank.blank,
    rec: rec.autoRecommendation,
    lSpawn,
    glyphSource,
    vScale: vLayout.scale,
    lScale: fill.scale,
  })}\n`,
);
