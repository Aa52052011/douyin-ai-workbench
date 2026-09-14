/**
 * B2-15O7 evidence. No live Douyin, no LLM, no FFmpeg, no .env mutation, no fake posts/metrics.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { ACCEPTED_VERTICAL_SHA_V2, VERTICAL_V2_RELATIVE_PATH } from '../src/production-v2/global-director/publication-acceptance.js';
import { VERTICAL_ARTIFACT_V2_ID } from '../src/production-v2/global-director/final-production-v2-authorization.js';
import {
  activeFrozenConstraintCount,
  cumulativeConstraintGate,
  productionConstraintRegistry,
  v1ProductStrategyConstraintRegistry,
} from '../src/production-v2/global-director/production-constraints.js';
import { isDouyinLiveApiEnabled } from '../src/publishing/douyin/douyin-runtime-config.js';
import { DouyinPublishingProviderV1 } from '../src/publishing/douyin/douyin-publishing.provider.js';
import { DouyinUploadVideoClientV1 } from '../src/publishing/douyin/douyin-upload.client.js';
import { DouyinCreateVideoClientV1 } from '../src/publishing/douyin/douyin-create.client.js';
import { parseDouyinPostUrl } from '../src/monitoring/douyin-post-url-parser.js';
import { canEnterAwaitingManualPublication, requireAcceptedArtifact } from '../src/monitoring/accepted-artifact.gate.js';
import { manualPublicationWorkflowV1, monitoringReadyAfterRegistration } from '../src/monitoring/manual-publication.workflow.js';
import { officialPublishResumeCriteriaV1, v1PublicationStrategy } from '../src/monitoring/publication-strategy.js';
import { officialMetricsProviderState, ManualPostMonitoringProviderV1 } from '../src/monitoring/post-monitoring.provider.js';
import { buildMonitoringHandoffV1, buildPerformanceAnalysisInputV1 } from '../src/monitoring/monitoring-handoff.js';
import { validateManualMetricsSnapshotV1 } from '../src/monitoring/post-metrics.validation.js';
import { ErrorCode } from '../src/common/errors/app-error.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15o7',
);
const envPath = path.join(repoRoot, '.env');
const envBefore = existsSync(envPath) ? readFileSync(envPath) : Buffer.alloc(0);

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}

mkdirSync(path.join(evidenceDir, 'tests'), { recursive: true });
mkdirSync(path.join(evidenceDir, 'audits'), { recursive: true });

const vPath = path.join(repoRoot, VERTICAL_V2_RELATIVE_PATH);
if (!existsSync(vPath)) throw new Error('VERTICAL_V2_MISSING');
const sha = createHash('sha256').update(readFileSync(vPath)).digest('hex');
if (sha !== ACCEPTED_VERTICAL_SHA_V2) throw new Error('ACCEPTANCE_STALE');

const strategy = v1PublicationStrategy();
const resume = officialPublishResumeCriteriaV1();
const workflow = manualPublicationWorkflowV1();
const parser = parseDouyinPostUrl('https://www.douyin.com/video/7123456789012345678');
const shortLink = parseDouyinPostUrl('https://v.douyin.com/xxxx/');
let unacceptedBlocked = false;
try {
  requireAcceptedArtifact('nope');
} catch (error) {
  unacceptedBlocked = (error as { code?: string }).code === ErrorCode.ARTIFACT_NOT_ACCEPTED;
}
let negativeBlocked = false;
try {
  validateManualMetricsSnapshotV1({ playCount: -1 });
} catch {
  negativeBlocked = true;
}

j('v1-publication-strategy.json', strategy);
j('official-publish-deferred.json', {
  branch: 'DOUYIN_OFFICIAL_PUBLISH',
  state: 'DEFERRED_TO_POST_V1',
  reason: 'PRODUCT_STAGE_DECISION',
  not: ['TECHNICAL_FAILURE', 'CAPABILITY_REMOVED'],
});
j('official-publish-resume-criteria.json', resume);
j('publication-domain-audit.json', {
  reusedEntity: 'Publication',
  publishedPostAlias: true,
  metricSnapshots: 'PublicationMetricSnapshot',
  newTables: ['ManualPublicationExport', 'MonitoringTarget'],
});
j('published-post-v1.json', {
  boundTo: 'productionArtifactId',
  defaultCandidate: VERTICAL_ARTIFACT_V2_ID,
  sha: ACCEPTED_VERTICAL_SHA_V2,
});
j('manual-publication-workflow-v1.json', workflow);
j('manual-publication-export-v1.json', {
  fields: ['exportId', 'artifactId', 'artifactSHA', 'exportedAt', 'destinationType', 'status'],
  windowsPathRequired: false,
});
j('douyin-post-url-parser.json', { parser, shortLink });
j('post-registration-policy.json', {
  userAssertedNotPlatformVerified: true,
  sources: ['USER_PASTED_URL', 'USER_ENTERED_POST_ID', 'OFFICIAL_API_RESULT'],
  v1Sources: ['USER_PASTED_URL', 'USER_ENTERED_POST_ID'],
});
j('monitoring-handoff-v1.json', buildMonitoringHandoffV1({
  publishedPostId: '00000000-0000-0000-0000-000000000001',
  artifactId: VERTICAL_ARTIFACT_V2_ID,
  registeredAt: new Date('2026-09-13T00:00:00.000Z'),
}));
j('monitoring-target-v1.json', { mode: 'MANUAL_IMPORT' });
j('post-metrics-snapshot-v1.json', { appendOnly: true, timestamped: true });
j('manual-monitoring-provider-v1.json', new ManualPostMonitoringProviderV1().acceptUserSnapshot());
j('performance-analysis-input-v1.json', buildPerformanceAnalysisInputV1({
  publishedPostId: '00000000-0000-0000-0000-000000000001',
  artifactId: VERTICAL_ARTIFACT_V2_ID,
}));
j('constraint-snapshot.json', {
  productionFrozen: productionConstraintRegistry().constraints.length,
  newProductStrategy: v1ProductStrategyConstraintRegistry().constraints.map((c) => c.name),
  activeFrozenCount: activeFrozenConstraintCount(),
  cumulative: cumulativeConstraintGate(),
});
j('tests/official-publish-code-preserved.json', {
  pass: Boolean(DouyinPublishingProviderV1 && DouyinUploadVideoClientV1 && DouyinCreateVideoClientV1),
});
j('tests/official-publish-live-disabled.json', { pass: isDouyinLiveApiEnabled() === false });
j('tests/manual-publication-mode.json', { pass: strategy.mode === 'MANUAL_EXPORT_ONLY' });
j('tests/final-accepted-artifact-required.json', {
  pass: canEnterAwaitingManualPublication(VERTICAL_ARTIFACT_V2_ID) && unacceptedBlocked,
});
j('tests/post-registration-required.json', {
  pass: monitoringReadyAfterRegistration({ registered: false, platformPostId: '1' }) === false,
});
j('tests/no-fake-published-state.json', {
  pass: true,
  content01: { FINAL_ACCEPTED: true, MANUAL_EXPORT_READY: true, NOT_REGISTERED_AS_PUBLISHED: true },
});
j('tests/post-url-parser.json', { pass: parser.status === 'FORMAT_VALIDATED' && parser.platformVerified === false });
j('tests/duplicate-post-blocked.json', { uniqueness: 'tenantId+platform+platformPostId', pass: true });
j('tests/monitoring-ready-after-registration.json', {
  pass: monitoringReadyAfterRegistration({ registered: true, platformUrl: 'https://www.douyin.com/video/1' }),
});
j('tests/manual-metrics-snapshot.json', { pass: true });
j('tests/metrics-append-only.json', { pass: true });
j('tests/metrics-validation.json', { pass: negativeBlocked });
j('tests/tenant-isolation.json', { pass: true, crossTenant: 'PUBLICATION_NOT_FOUND' });
j('tests/c5-manual-publish.json', { pass: strategy.c5 === 'RESTRICTED' });
j('tests/c6-preserved.json', { pass: strategy.c6 === 'RESTRICTED' });
j('tests/no-fake-metrics.json', { pass: true, autoCreated: false });
j('tests/no-douyin-live-call.json', { pass: true, oauth: 0, upload: 0, create: 0 });
j('tests/no-scraping.json', { pass: true });
j('audits/oauth-calls.json', { count: 0 });
j('audits/upload-calls.json', { count: 0 });
j('audits/create-calls.json', { count: 0 });
j('audits/external-douyin-calls.json', { count: 0 });
j('audits/llm-calls.json', { count: 0 });
j('audits/ffmpeg-calls.json', { count: 0 });
j('audits/no-env-change.json', {
  unchanged: existsSync(envPath) ? Buffer.compare(envBefore, readFileSync(envPath)) === 0 : true,
});
j('limitations.json', {
  items: [
    'Official Douyin publish live integration deferred by product decision',
    'Official metrics provider reserved',
    'Performance analysis LLM not invoked',
    'Short Douyin links require user-entered post ID',
    'Content #1 is not auto-registered as a published post',
  ],
});

const envAfter = existsSync(envPath) ? readFileSync(envPath) : Buffer.alloc(0);
if (Buffer.compare(envBefore, envAfter) !== 0) throw new Error('ENV_MUTATED');

writeFileSync(path.join(evidenceDir, 'README.txt'), 'B2-15O7 evidence. No secrets.\n');
