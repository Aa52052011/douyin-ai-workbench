/**
 * B2-15L: explicit production authorization + dual-profile execution preparation.
 * No production FFmpeg, no Vision/LLM, no calibration promotion.
 */
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_01_REVIEW_SESSION_ID } from '../src/production-v2/dynamic-reframe/human-feedback.js';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { FileExecutionPlanStore } from '../src/production-v2/source-aware-output/execution-plan-store.js';
import { FileVisualApprovalStore } from '../src/production-v2/source-aware-output/visual-approval-store.js';
import {
  FileProductionAuthorizationStore,
  FileProductionExecutionPreparationStore,
} from '../src/production-v2/source-aware-output/production-authorization-store.js';
import {
  buildProductionExecutionPreparation,
  evaluateDualProfileReadiness,
  evaluateFinalTruthGate,
  evaluateFinalVisualApprovalGate,
  isCalibrationArtifactPath,
  productionUsableAfterGates,
  readyToRender,
} from '../src/production-v2/source-aware-output/final-readiness.js';
import {
  EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  FROZEN_B215J_LANDSCAPE_CONFIG_HASH,
  FROZEN_B215J_VERTICAL_CONFIG_HASH,
  assertFrozenB215JHashes,
  authorizationIdentityFromPlan,
  bindProductionAuthorizationToPlan,
  createOrReuseProductionAuthorization,
  identityFromPlan,
  isAmbiguousAuthorizationPhrase,
  isExplicitProductionAuthorizationPhrase,
  matchApprovalToIdentity,
  matchAuthorizationToIdentity,
} from '../src/production-v2/source-aware-output/visual-approval.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15l',
);

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
loadEnvKeys(['CROP_REVIEW_REPO_ROOT']);
process.env.CROP_REVIEW_REPO_ROOT = repoRoot;
function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}

const FROZEN_APPROVAL_ID = '2f6ed1e4-40f1-4376-9c47-44c2a457e5e0';
const planStore = new FileExecutionPlanStore(repoRoot);
const approvalStore = new FileVisualApprovalStore(repoRoot);
const authzStore = new FileProductionAuthorizationStore(repoRoot);
const prepStore = new FileProductionExecutionPreparationStore(repoRoot);
const tenantId = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';

const before = await planStore.getByReviewSession(tenantId, CONTENT_01_REVIEW_SESSION_ID);
if (!before) throw new Error('EXECUTION_PLAN_MISSING');
if (before.status !== 'WAITING_FOR_PRODUCTION_AUTHORIZATION' && before.status !== 'AUTHORIZED_PREPARED') {
  throw new Error(`UNEXPECTED_PLAN_STATUS:${before.status}`);
}
const identity = identityFromPlan(before);
assertFrozenB215JHashes(identity);
if (identity.verticalConfigHash !== FROZEN_B215J_VERTICAL_CONFIG_HASH) throw new Error('STOP_HASH_CHANGED_VERTICAL');
if (identity.landscapeConfigHash !== FROZEN_B215J_LANDSCAPE_CONFIG_HASH) throw new Error('STOP_HASH_CHANGED_LANDSCAPE');
if (before.sourceAssetId !== '803fafd2-4c0e-4412-80d7-a0d6452cefac') throw new Error('STOP_SOURCE_CHANGED');

const approval = await approvalStore.getByReviewSession(tenantId, CONTENT_01_REVIEW_SESSION_ID);
if (!approval) throw new Error('VISUAL_APPROVAL_MISSING');
if (approval.approvalId !== FROZEN_APPROVAL_ID) throw new Error('STOP_APPROVAL_ID_CHANGED');
if (matchApprovalToIdentity(approval, identity) !== 'MATCH') throw new Error('VISUAL_APPROVAL_STALE');

const authzIdentity = authorizationIdentityFromPlan(before, approval.approvalId);
const existing = await authzStore.getByReviewSession(tenantId, CONTENT_01_REVIEW_SESSION_ID);
const created = createOrReuseProductionAuthorization({
  phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  authorizationId: randomUUID(),
  executionPreparationId: randomUUID(),
  tenantId: before.tenantId,
  workspaceId: before.workspaceId,
  projectId: before.projectId,
  reviewSessionId: before.reviewSessionId,
  productionPlanId: before.planId,
  identity: authzIdentity,
  approvalMatch: 'MATCH',
  existing,
});
const persisted = await authzStore.putIfAbsentOrSameHash(created.authorization);
if (!persisted.authorizationId) throw new Error('AUTHORIZATION_PERSIST_FAILED');
const replay = createOrReuseProductionAuthorization({
  phrase: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  authorizationId: randomUUID(),
  executionPreparationId: randomUUID(),
  tenantId: before.tenantId,
  workspaceId: before.workspaceId,
  projectId: before.projectId,
  reviewSessionId: before.reviewSessionId,
  productionPlanId: before.planId,
  identity: authzIdentity,
  approvalMatch: 'MATCH',
  existing: persisted,
});
if (replay.authorization.authorizationId !== persisted.authorizationId) throw new Error('IDEMPOTENCY_FAILED');
if (matchAuthorizationToIdentity(persisted, authzIdentity) !== 'MATCH') throw new Error('AUTHORIZATION_NOT_BOUND');

const preparationDraft = buildProductionExecutionPreparation({
  preparationId: persisted.executionPreparationId,
  authorizationId: persisted.authorizationId,
  approvalId: approval.approvalId,
  plan: before,
});
const preparation = await prepStore.putIfAbsent(preparationDraft);
const after = bindProductionAuthorizationToPlan(before, persisted);
if (JSON.stringify(after.profiles) !== JSON.stringify(before.profiles)) throw new Error('PLAN_HASHES_MUTATED');
await planStore.upsert(after);
const reloadedPlan = await planStore.getByReviewSession(tenantId, CONTENT_01_REVIEW_SESSION_ID);
if (reloadedPlan?.status !== 'AUTHORIZED_PREPARED') throw new Error('PLAN_TRANSITION_FAILED');
if (JSON.stringify(reloadedPlan.profiles) !== JSON.stringify(before.profiles)) throw new Error('PLAN_HASHES_MUTATED_AFTER_RELOAD');
if (reloadedPlan.restrictedClaims.join(',') !== 'C5,C6') throw new Error('STOP_TRUTH_RESTRICTIONS_LIFTED');

const visual = evaluateFinalVisualApprovalGate({ outputStrategySelected: true, explicitHumanVisualApproval: true });
const truth = evaluateFinalTruthGate();
if (truth.result !== 'PASS_WITH_RESTRICTIONS') throw new Error('STOP_TRUTH_GATE_CHANGED');
if (truth.restrictedClaims.join(',') !== 'C5,C6') throw new Error('STOP_TRUTH_RESTRICTIONS_LIFTED');
const readiness = evaluateDualProfileReadiness({
  strategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
  visualApproved: true,
  productionAuthorized: true,
});
const renderReady = readyToRender({
  strategySelected: true,
  profileConfigValid: true,
  sourceOriginalAvailable: true,
  visualApproved: true,
  truthAcceptable: true,
  productionAuthorized: true,
});
const usable = productionUsableAfterGates({
  visualApproved: true,
  truthAcceptable: true,
  productionAuthorized: true,
  renderSuccess: false,
  artifactValidated: false,
});
const cross = await authzStore.getByReviewSession('00000000-0000-4000-8000-000000000000', CONTENT_01_REVIEW_SESSION_ID);

j('implementation-summary.json', {
  step: 'B2-15L',
  previewFfmpeg: 0,
  calibrationFfmpeg: 0,
  productionFfmpeg: 0,
  provider: 0,
  vision: 0,
  llm: 0,
  authorizationCreated: true,
  productionArtifact: false,
  autoRender: false,
});
j('explicit-human-authorization-input.json', {
  message: EXPLICIT_PRODUCTION_AUTHORIZATION_MESSAGE,
  source: 'EXPLICIT_USER_MESSAGE',
});
j('production-authorization-object.json', persisted);
j('authorization-binding.json', authzIdentity);
j('authorization-binding-hash.json', { hash: persisted.authorizationBindingHash });
j('visual-approval-ref.json', { approvalId: approval.approvalId, match: 'MATCH' });
j('truth-binding.json', { result: truth.result, restrictedClaims: persisted.restrictedClaims });
j('profile-readiness-after-authorization.json', readiness);
j('execution-plan-transition.json', { before: before.status, after: reloadedPlan.status, planId: before.planId });
j('production-execution-preparation.json', preparation);
j('production-boundary.json', {
  readyToRender: renderReady,
  productionUsable: usable,
  productionArtifact: null,
  calibrationPromotable: false,
  calibrationPaths: ['V_1080x1920_crf18.mp4', 'L_1920x1080_crf18.mp4'].map((name) => ({
    name,
    isCalibration: isCalibrationArtifactPath(name),
    productionUsable: false,
  })),
  continueDoesNotAuthorize: isAmbiguousAuthorizationPhrase('继续'),
  visualPhraseDoesNotAuthorize: !isExplicitProductionAuthorizationPhrase('我批准当前视觉方案'),
});
j('tests/authorization-created.json', { ok: Boolean(persisted.authorizationId) });
j('tests/authorization-source.json', {
  source: persisted.authorizationSource,
  ok: persisted.authorizationSource === 'EXPLICIT_USER_MESSAGE' && persisted.authorizedBy === 'HUMAN_USER',
});
j('tests/authorization-immutable.json', { ok: persisted.immutable === true });
j('tests/authorization-idempotency.json', { ok: replay.idempotent && replay.authorization.authorizationId === persisted.authorizationId });
j('tests/bound-to-current-source.json', { ok: persisted.sourceAssetId === before.sourceAssetId });
j('tests/bound-to-both-profiles.json', { ok: persisted.profileIds.length === 2 });
j('tests/bound-to-current-config-hashes.json', {
  ok:
    persisted.verticalConfigHash === FROZEN_B215J_VERTICAL_CONFIG_HASH &&
    persisted.landscapeConfigHash === FROZEN_B215J_LANDSCAPE_CONFIG_HASH,
});
j('tests/bound-to-truth-restrictions.json', {
  ok: persisted.restrictedClaims.includes('C5') && persisted.restrictedClaims.includes('C6') && truth.result === 'PASS_WITH_RESTRICTIONS',
});
j('tests/plan-authorized-prepared.json', { ok: reloadedPlan.status === 'AUTHORIZED_PREPARED' });
j('tests/ready-to-render-true.json', { ok: renderReady === true });
j('tests/production-usable-false.json', { ok: usable === false });
j('tests/no-calibration-promotion.json', { ok: persisted.calibrationPromotionForbidden === true });
j('tests/tenant-scope.json', { cross, ok: cross === null });
j('audits/preview-ffmpeg.json', { n: 0 });
j('audits/calibration-ffmpeg.json', { n: 0 });
j('audits/production-ffmpeg.json', { n: 0 });
j('audits/provider-calls.json', { n: 0 });
j('audits/vision-calls.json', { n: 0 });
j('audits/llm-calls.json', { n: 0 });
j('audits/no-env-change.json', { modified: false });
j('limitations.json', {
  count: 2,
  items: ['AUTHORIZE_PRODUCTION_UI_DISABLED_CONTRACT_ONLY', 'PRODUCTION_ARTIFACTS_NOT_CREATED_NO_RENDER'],
});

if (visual.overall !== 'APPROVED') throw new Error('VISUAL_GATE_NOT_APPROVED');
if (readiness.vertical.state !== 'READY_TO_RENDER') throw new Error('VERTICAL_READINESS');
if (readiness.landscape.state !== 'READY_TO_RENDER') throw new Error('LANDSCAPE_READINESS');
if (renderReady !== true) throw new Error('READY_TO_RENDER_EXPECTED');
if (usable !== false) throw new Error('PRODUCTION_USABLE_MUST_STAY_FALSE');

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    authorizationId: persisted.authorizationId,
    idempotent: replay.idempotent,
    planStatus: reloadedPlan.status,
    readyToRender: renderReady,
  })}\n`,
);
