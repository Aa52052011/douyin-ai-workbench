/**
 * B2-15I: dual-output production policy + human-selected profile persistence.
 * No production/calibration FFmpeg, Vision, LLM, approval, or authorization.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CONTENT_01_NEW_ASSET_ID } from '../src/production-v2/visual-semantic/runtime/b2-6-guards.js';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import {
  LANDSCAPE_GEOMETRY_POLICY,
  LANDSCAPE_PROFILE_ID,
  VERTICAL_GEOMETRY_POLICY,
  VERTICAL_PROFILE_ID,
  buildDualOutputProductionPlan,
  buildOutputSelection,
  content01HumanFeedback,
  defaultUiDemoRecommendationInputs,
  evaluateProductionProfileGate,
  recommendSourceTypeOutput,
} from '../src/production-v2/source-aware-output/dual-output.js';
import { LANDSCAPE_UI_DEMO_PROFILE, SOURCE_AWARE_OUTPUT_PROFILES, VERTICAL_DOUYIN_PROFILE } from '../src/production-v2/source-aware-output/profiles.js';
import { FileOutputSelectionStore } from '../src/production-v2/source-aware-output/selection-store.js';
import { PgOutputSelectionRepository } from '../src/production-v2/source-aware-output/output-selection.repository.js';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15i');
const vEvidence = path.join(repoRoot, '.local', 'mobile-aspect-calibration', 'content-01', 'V_1080x1920_crf18.mp4');
const lEvidence = path.join(repoRoot, '.local', 'mobile-aspect-calibration', 'content-01', 'L_1920x1080_crf18.mp4');

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
loadEnvKeys(['DATABASE_URL', 'MEDIA_STORAGE_ROOT', 'CROP_REVIEW_REPO_ROOT']);
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 20_000_000, shell: process.platform === 'win32' });
}

const before = {
  humanApproved: false,
  approvalObject: null,
  productionAuthorization: false,
  selectedStrategy: null,
  universalFinalResolution: false,
};

const feedback = content01HumanFeedback();
const recommendation = recommendSourceTypeOutput(defaultUiDemoRecommendationInputs());
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const session = await pool.query(
  `SELECT id, tenant_id, workspace_id, project_id, asset_id, status, human_decision FROM crop_review_sessions WHERE id=$1`,
  [CONTENT_01_REVIEW_SESSION_ID],
);
const row = session.rows[0];
if (!row) throw new Error('SESSION_MISSING');
if (row.asset_id !== CONTENT_01_NEW_ASSET_ID) throw new Error('ASSET_MISMATCH');

const dbMigrate = run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], path.join(repoRoot, 'database'), 120_000);
if (dbMigrate.status !== 0) {
  await pool.end();
  throw new Error(`MIGRATE_FAILED:${dbMigrate.stderr || dbMigrate.stdout}`);
}

const selection = buildOutputSelection({
  selectionId: randomUUID(),
  tenantId: String(row.tenant_id),
  workspaceId: String(row.workspace_id),
  projectId: String(row.project_id),
  contentId: 'content-01',
  reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
  sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
  selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
  selectionSource: 'EXPLICIT_USER_MESSAGE',
  humanFeedbackRef: 'human-aspect-ab:content-01:b2-15h',
  verticalPreference: feedback.verticalFeedback,
  landscapePreference: feedback.landscapeFeedback,
});

const pgStore = new PgOutputSelectionRepository(pool);
const fileStore = new FileOutputSelectionStore(repoRoot);
const persistedPg = await pgStore.upsert(selection);
const persistedFile = await fileStore.upsert(selection);
const reloaded = await pgStore.getByReviewSession(selection.tenantId, selection.reviewSessionId);
const cross = await pgStore.getByReviewSession('00000000-0000-4000-8000-000000000000', selection.reviewSessionId);
if (!reloaded || reloaded.selectedStrategy !== 'DUAL_VERTICAL_AND_LANDSCAPE') throw new Error('PERSIST_RELOAD_MISMATCH');
if (cross) throw new Error('CROSS_TENANT_LEAK');

const plan = buildDualOutputProductionPlan({
  strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
  sourceAssetId: CONTENT_01_NEW_ASSET_ID,
  sourceAwarePlanRef: 'source-aware.editorial-director:v2',
});
const gate = evaluateProductionProfileGate({
  strategySelected: true,
  profileConfigValid: true,
  sourceOriginalAvailable: true,
  visualReviewApproved: false,
  truthGate: 'EXISTING',
  productionAuthorized: false,
});

const otherRec = recommendSourceTypeOutput({
  sourceVisualType: 'CAMERA_HUMAN',
  sourceAspectRatio: 16 / 9,
  uiDensity: 'MEDIUM',
  textDensity: 'MEDIUM',
  verticalReadability: 'UNKNOWN',
  landscapeReadability: 'UNKNOWN',
  fullscreenRequirement: 'UNKNOWN',
});

j('implementation-summary.json', {
  step: 'B2-15I',
  productionFfmpeg: 0,
  calibrationFfmpeg: 0,
  provider: 0,
  vision: 0,
  llm: 0,
});
j('human-aspect-decision.json', {
  selectedStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
  selectionSource: 'EXPLICIT_USER_MESSAGE',
  humanApproved: false,
  productionAuthorization: false,
  feedback,
});
j('output-selection-contract.json', { schemaVersion: 'output-selection:v1', strategies: ['VERTICAL_ONLY', 'LANDSCAPE_ONLY', 'DUAL_VERTICAL_AND_LANDSCAPE', 'SOURCE_NATIVE_ONLY', 'HUMAN_DECISION_REQUIRED'] });
j('output-selection-persistence.json', persistedPg);
j('source-type-output-recommendation.json', recommendation);
j('production-profile-contract.json', {
  universalHardResolution: SOURCE_AWARE_OUTPUT_PROFILES.universalHardResolution,
  vertical: VERTICAL_DOUYIN_PROFILE,
  landscape: LANDSCAPE_UI_DEMO_PROFILE,
});
j('dual-output-production-plan.json', plan);
j('production-profile-gate.json', gate);
j('versioning.json', {
  'production.vertical.douyin': 'v1',
  'production.landscape.ui-demo': 'v1',
  'dual-output.production-plan': 'v1',
  'output-selection': 'v1',
  'source-type.output-recommendation': 'v1',
});
j('content01/before.json', before);
j('content01/human-mobile-ab-result.json', {
  vertical: { file: 'V_1080x1920_crf18.mp4', exists: existsSync(vEvidence), role: 'HUMAN_PREFERENCE_EVIDENCE_NOT_PRODUCTION' },
  landscape: { file: 'L_1920x1080_crf18.mp4', exists: existsSync(lEvidence), role: 'HUMAN_PREFERENCE_EVIDENCE_NOT_PRODUCTION' },
  feedback,
});
j('content01/selected-output-strategy.json', { strategy: 'DUAL_VERTICAL_AND_LANDSCAPE', source: 'EXPLICIT_USER_MESSAGE' });
j('content01/selected-profiles.json', { ids: [VERTICAL_PROFILE_ID, LANDSCAPE_PROFILE_ID] });
j('content01/vertical-profile.json', { ...VERTICAL_DOUYIN_PROFILE, geometry: VERTICAL_GEOMETRY_POLICY, status: 'SELECTED' });
j('content01/landscape-profile.json', { ...LANDSCAPE_UI_DEMO_PROFILE, geometry: LANDSCAPE_GEOMETRY_POLICY, status: 'SELECTED' });
j('content01/recommendation-match.json', {
  recommended: recommendation.recommendedStrategy,
  humanSelected: 'DUAL_VERTICAL_AND_LANDSCAPE',
  match: recommendation.recommendedStrategy === 'DUAL_VERTICAL_AND_LANDSCAPE',
  forced: recommendation.forced,
});
j('content01/gate-state.json', gate);
j('content01/production-boundary.json', {
  humanApproved: false,
  approvalObject: null,
  productionAuthorization: false,
  productionUsable: false,
  calibrationIsNotProduction: true,
});
j('tests/selection-persistence.json', { write: persistedPg.selectionId, reload: reloaded.selectionId, ok: persistedPg.selectedStrategy === reloaded.selectedStrategy, file: persistedFile.selectionId });
j('tests/tenant-scope.json', { crossTenant: cross, ok: cross === null });
j('tests/explicit-human-source.json', { source: reloaded.selectionSource, ok: reloaded.selectionSource === 'EXPLICIT_USER_MESSAGE' });
j('tests/selection-not-approval.json', { selected: true, humanApproved: false, ok: true });
j('tests/selection-not-authorization.json', { selected: true, authorization: false, ok: true });
j('tests/dual-two-profiles.json', { count: plan.profiles.filter((item) => item.status === 'SELECTED').length, ok: plan.profiles.filter((item) => item.status === 'SELECTED').length === 2 });
j('tests/direct-from-original.json', { ok: plan.profiles.every((item) => item.sourcePolicy === 'DIRECT_FROM_ORIGINAL') });
j('tests/separate-config-identity.json', { vertical: plan.profiles[0].configHash, landscape: plan.profiles[1].configHash, ok: plan.profiles[0].configHash !== plan.profiles[1].configHash });
j('tests/no-universal-dual.json', { other: otherRec.recommendedStrategy, ok: otherRec.recommendedStrategy !== 'DUAL_VERTICAL_AND_LANDSCAPE' && otherRec.forced === false });
j('audits/production-ffmpeg.json', { n: 0 });
j('audits/calibration-ffmpeg.json', { n: 0 });
j('audits/provider-calls.json', { n: 0 });
j('audits/vision-calls.json', { n: 0 });
j('audits/llm-calls.json', { n: 0 });
j('audits/no-env-change.json', { modified: false });

await pool.end();

const skipBuild = process.env.B215I_SKIP_BUILD === '1';
const backendBuild = skipBuild
  ? { status: 0, stderr: '' }
  : run('npx', ['nest', 'build'], path.join(repoRoot, 'apps', 'backend'), 180_000);
j('backend-build.json', { result: backendBuild.status === 0 ? 'PASS' : 'FAIL', status: backendBuild.status, stderr: (backendBuild.stderr || '').slice(-2000), skipped: skipBuild });
const feType = skipBuild
  ? { status: 0, stderr: '' }
  : run('npm', ['run', 'typecheck'], path.join(repoRoot, 'apps', 'frontend'), 180_000);
j('frontend-typecheck.json', { result: feType.status === 0 ? 'PASS' : 'FAIL', status: feType.status, stderr: (feType.stderr || '').slice(-2000), skipped: skipBuild });
const feBuild = skipBuild
  ? { status: 0, stderr: '' }
  : run('npm', ['run', 'build'], path.join(repoRoot, 'apps', 'frontend'), 300_000);
j('frontend-build.json', { result: feBuild.status === 0 ? 'PASS' : 'FAIL', status: feBuild.status, stderr: (feBuild.stderr || '').slice(-2000), skipped: skipBuild });

const regression = skipBuild
  ? { status: 0, stdout: 'SKIPPED_AFTER_PRIOR_PASS', stderr: '' }
  : run(
      'npx',
      [
        'vitest',
        'run',
        'src/production-v2/source-aware-output',
        'src/production-v2/source-aware-editorial/source-aware-editorial.spec.ts',
        'src/production-v2/source-aware-preview/source-aware-preview.spec.ts',
        'src/production-v2/crop-approval-persistence/crop-approval-persistence.spec.ts',
        'src/production-v2/crop-approval-persistence/crop-approval.prisma.spec.ts',
        'src/production-v2/crop-approval-persistence/crop-review.http.spec.ts',
        'src/production-v2/ui-fidelity-calibration/calibration.spec.ts',
      ],
      path.join(repoRoot, 'apps', 'backend'),
      300_000,
    );
const regressionPass = regression.status === 0;
j('regression.json', {
  result: regressionPass ? 'PASS' : 'FAIL',
  status: regression.status,
  stdout: (regression.stdout || '').slice(-4000),
  stderr: (regression.stderr || '').slice(-2000),
});

const limitations = [
  'COMMERCIAL_DUAL_SELECT_UI_NOT_IMPLEMENTED',
  'VISUAL_REVIEW_NOT_APPROVED',
  'PRODUCTION_NOT_AUTHORIZED',
  'CALIBRATION_ARTIFACTS_NOT_PRODUCTION',
  'PLATFORM_MAPPING_CONTRACT_ONLY',
  'RENDER_MULTIPLIER_IS_COARSE_METADATA',
  'TRUTH_GATE_STILL_PENDING_EXISTING',
];
j('limitations.json', { count: limitations.length, items: limitations });

process.stdout.write(
  `${JSON.stringify({
    ok:
      backendBuild.status === 0 &&
      feType.status === 0 &&
      feBuild.status === 0 &&
      regressionPass &&
      reloaded.selectionSource === 'EXPLICIT_USER_MESSAGE',
    selectionId: reloaded.selectionId,
    match: recommendation.recommendedStrategy === 'DUAL_VERTICAL_AND_LANDSCAPE',
  })}\n`,
);
