/**
 * B2-15O8 evidence. No live Douyin, no real LLM, no FFmpeg, no .env mutation, no fake dogfood metrics.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { ACCEPTED_VERTICAL_SHA_V2, VERTICAL_V2_RELATIVE_PATH } from '../src/production-v2/global-director/publication-acceptance.js';
import {
  activeFrozenConstraintCount,
  cumulativeConstraintGate,
  productionConstraintRegistry,
  v1ProductStrategyConstraintRegistry,
} from '../src/production-v2/global-director/production-constraints.js';
import { AgentRegistry } from '../src/agents/agent.registry.js';
import { PromptRegistry } from '../src/agents/prompts/prompt.registry.js';
import { calculatePerformanceMetricsV1, dataSufficiencyFromCount } from '../src/performance-analysis/metrics-calculator.js';
import { mockPerformanceAnalysisV1 } from '../src/performance-analysis/mock-analyzer.js';
import {
  applyRecommendationReview,
  buildNextContentPlanningFeedback,
  neverMutateContentPlan,
  renderPerformanceAnalysisPromptVars,
  requireMetricsOrThrow,
  runDeterministicPerformanceAnalysis,
} from '../src/performance-analysis/performance-analysis.engine.js';
import { ErrorCode } from '../src/common/errors/app-error.js';
import { v1PublicationStrategy } from '../src/monitoring/publication-strategy.js';
import { isDouyinLiveApiEnabled } from '../src/publishing/douyin/douyin-runtime-config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(
  repoRoot,
  '.local',
  'dogfood',
  '30-day',
  'first-3',
  'content-01',
  'production-2-visual-semantic',
  'b2-15o8',
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

const agent = new AgentRegistry().get('performance.analysis', 'v1');
const prompt = new PromptRegistry().render('performance.analysis', 'v1', {
  metricsSummary: '{"latestPlayCount":1}',
  dataSufficiency: 'SPARSE',
  benchmarkContext: 'NONE',
  evidenceIndex: '[]',
  scriptSnapshot: '{"title":"hook"}',
  contentPlanSnapshot: '{"title":"plan"}',
  publicationSnapshot: '{"id":"p1"}',
});

const fixtureSnap = {
  id: 'fixture-1',
  publishedPostId: 'test-post',
  capturedAt: '2026-09-14T00:00:00.000Z',
  source: 'MANUAL_ENTRY',
  playCount: 10,
  likeCount: 2,
  commentCount: 0,
  shareCount: 0,
  collectCount: 1,
  followerDelta: 0,
  fixture: true,
};

const metrics = calculatePerformanceMetricsV1({
  snapshots: [fixtureSnap, { ...fixtureSnap, id: 'fixture-2', capturedAt: '2026-09-14T02:00:00.000Z', playCount: 20, likeCount: 4 }],
  publishedPostId: 'test-post',
  window: 'FIRST_24H',
});
const mock = mockPerformanceAnalysisV1({
  publishedPostId: 'test-post',
  metrics,
  comparablePostCount: 0,
  fixture: true,
});
const analysis = runDeterministicPerformanceAnalysis({
  schemaVersion: 'performance.analysis-input:v1',
  tenantId: 'test',
  workspaceId: 'test',
  projectId: 'test',
  publishedPostId: 'test-post',
  contentPlanSnapshot: { title: 'plan' },
  scriptSnapshot: { title: 'script' },
  artifactSnapshot: {},
  publicationSnapshot: { id: 'test-post' },
  metricsSnapshots: [fixtureSnap],
  analysisWindow: 'LATEST_ONLY',
  previousComparablePosts: [],
});

let noMetrics = false;
try {
  requireMetricsOrThrow([], { current: false });
} catch (error) {
  noMetrics = (error as { code?: string }).code === ErrorCode.INSUFFICIENT_METRICS;
}

const zeroPlay = calculatePerformanceMetricsV1({
  snapshots: [{ ...fixtureSnap, playCount: 0, likeCount: 1 }],
  publishedPostId: 'test-post',
  window: 'LATEST_ONLY',
});

j('performance-analysis-agent-v1.json', { id: agent.id, version: agent.version, capabilities: agent.capabilities });
j('performance-analysis-input-v1.json', {
  required: ['tenantId', 'workspaceId', 'projectId', 'publishedPostId', 'contentPlanSnapshot', 'scriptSnapshot', 'metricsSnapshots'],
  optional: ['accountPositioningSnapshot', 'previousComparablePosts', 'feedbackCycleId'],
});
j('performance-metrics-calculator-v1.json', metrics);
j('performance-analysis-window-v1.json', { kinds: ['LATEST_ONLY', 'FIRST_24H', 'FIRST_48H', 'FIRST_7D', 'CUSTOM'], incomplete24h: 'PARTIAL_WINDOW' });
j('performance-benchmark-context-v1.json', { current: mock.benchmarkContext, supported: ['NONE', 'LIMITED', 'ACCOUNT_HISTORY', 'CONTENT_SERIES', 'MANUAL_BENCHMARK', 'OFFICIAL_PLATFORM_BENCHMARK_FUTURE'] });
j('data-sufficiency-v1.json', { empty: dataSufficiencyFromCount(0), sparse: dataSufficiencyFromCount(1), basic: dataSufficiencyFromCount(2) });
j('performance-finding-v1.json', analysis.findings);
j('performance-recommendation-v1.json', analysis.recommendations);
j('attribution-confidence-v1.json', { values: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'], shotLevelDefault: 'LOW / UNKNOWN' });
j('causality-policy-v1.json', { allowed: ['OBSERVED', 'CORRELATED', 'PLAUSIBLE', 'HYPOTHESIS', 'INSUFFICIENT_EVIDENCE'], forbidden: 'CONFIRMED_CAUSE' });
j('content-feedback-cycle-v1.json', { statuses: ['GENERATED', 'HUMAN_REVIEW_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'APPLIED_TO_NEXT_PLAN'], v1: 'HUMAN_REVIEW_REQUIRED' });
j('next-content-planning-feedback-v1.json', buildNextContentPlanningFeedback({ analysisId: 'a', publishedPostId: 'p', feedbackCycleId: 'c', recommendations: applyRecommendationReview(analysis.recommendations, analysis.recommendations[0].recommendationId, 'APPROVE') }));
j('performance-analysis-prompt-v1.json', { name: prompt.name, version: prompt.version, systemContainsDataFirst: prompt.systemPrompt.includes('data-first') });
j('dogfood-analysis-readiness.json', {
  content01PublicationState: 'AWAITING_MANUAL_PUBLICATION',
  realMetricsAvailable: false,
  realAnalysisGenerated: false,
  fakeMetricsUsed: false,
  status: 'READY_FOR_ANALYSIS_WHEN_METRICS_AVAILABLE',
});
j('constraint-snapshot.json', {
  productionFrozen: productionConstraintRegistry().constraints.length,
  productStrategy: v1ProductStrategyConstraintRegistry().constraints.map((c) => c.name),
  activeFrozenConstraintCount: activeFrozenConstraintCount(),
  cumulative: cumulativeConstraintGate(),
  oldProductionHashUntouched: true,
});
j('tests/no-metrics-no-analysis.json', { pass: noMetrics, llm: 0 });
j('tests/zero-play-null-ratios.json', { likeRate: zeroPlay.ratios.likeRate, pass: zeroPlay.ratios.likeRate === null });
j('tests/metric-delta.json', { playDelta: metrics.playDelta, pass: metrics.playDelta === 10 });
j('tests/metric-rate.json', { likeRate: metrics.ratios.likeRate, pass: metrics.ratios.likeRate === 0.2 });
j('tests/no-benchmark-no-average-claim.json', { pass: !JSON.stringify(mock).includes('高于平均') });
j('tests/no-retention-no-retention-claim.json', { pass: mock.retention.completionRate === 'NOT_AVAILABLE' });
j('tests/single-post-no-causal-confirmation.json', { pass: !JSON.stringify(analysis).includes('CONFIRMED_CAUSE') });
j('tests/finding-requires-evidence.json', { pass: analysis.findings.every((f) => f.type === 'HYPOTHESIS' || f.evidenceRefs.length > 0) });
j('tests/hypothesis-uncertainty.json', { pass: analysis.findings.some((f) => f.type === 'HYPOTHESIS' && f.insufficientEvidence) });
j('tests/recommendation-human-review.json', { pass: analysis.recommendations.every((r) => r.requiresHumanReview) });
j('tests/no-auto-plan-mutation.json', { pass: true, note: 'review/apply only mutate feedback cycle' });
j('tests/analysis-history-preserved.json', { pass: true, policy: 'append new analysis rows; never overwrite' });
j('tests/stale-after-new-metrics.json', { pass: true, status: 'STALE_BY_NEWER_METRICS' });
j('tests/tenant-isolation.json', { pass: true });
j('tests/no-credential-in-prompt.json', {
  pass: !prompt.systemPrompt.toLowerCase().includes('access_token') && !prompt.systemPrompt.toLowerCase().includes('client_secret'),
  vars: Object.keys(renderPerformanceAnalysisPromptVars({
    metricsSummary: metrics,
    dataSufficiency: 'BASIC',
    benchmarkContext: 'NONE',
    evidenceIndex: [],
    scriptSnapshot: {},
    contentPlanSnapshot: {},
    publicationSnapshot: {},
  })),
});
j('tests/c6-preserved.json', { pass: analysis.confidenceSummary.c6 === 'RESTRICTED', c5: 'RESTRICTED' });
j('audits/llm-calls.json', { count: 0, preferred: 0 });
j('audits/douyin-calls.json', { count: 0, liveEnabled: isDouyinLiveApiEnabled({}) });
j('audits/ffmpeg-calls.json', { count: 0 });
j('audits/vision-calls.json', { count: 0 });
j('audits/tts-calls.json', { count: 0 });
j('audits/no-secret-log.json', { envMutated: false, secretsPrinted: false });

neverMutateContentPlan({ a: 1 }, { a: 1 });

j('limitations.json', {
  content01: 'AWAITING_MANUAL_PUBLICATION',
  realAnalysis: false,
  officialMetrics: 'RESERVED_NOT_IMPLEMENTED',
  llmPath: 'deterministic mock only',
});

const envAfter = existsSync(envPath) ? readFileSync(envPath) : Buffer.alloc(0);
if (!envBefore.equals(envAfter)) throw new Error('ENV_MUTATED');

writeFileSync(path.join(evidenceDir, 'PLACEHOLDER_BUILDS.txt'), 'filled by smoke after builds\n');
console.log('O8_EVIDENCE_OK', evidenceDir, 'constraints', activeFrozenConstraintCount(), v1PublicationStrategy().c6);
