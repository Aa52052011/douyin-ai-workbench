import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { AgentError } from '../agents/agent.errors.js';
import { ErrorCode } from '../common/errors/app-error.js';
import {
  parseAndValidateReferenceAnalysisModelText,
  validateReferenceAnalysisOutput,
} from '../agents/definitions/reference-analysis.agent.js';
import { isAssetProductionEligible } from '../assets/asset-library.js';
import {
  assessAnalysisInput,
  buildDeterministicReferenceAnalysis,
  computeReferenceInputHash,
  looksLikeDirectQuote,
  postprocessReferenceAnalysis,
} from './reference-intelligence.helpers.js';
import {
  REFERENCE_ANALYSIS_OUTPUT_VERSION,
  REFERENCE_CONTEXT_LIMITS,
} from './reference-intelligence.types.js';

describe('reference intelligence helpers', () => {
  it('marks URL-only without text as insufficient', () => {
    const r = assessAnalysisInput({
      url: 'https://www.douyin.com/video/123',
      assetId: null,
      title: null,
      note: null,
      reasonForReference: null,
    });
    assert.equal(r.sufficient, false);
    assert.equal(r.reason, 'ANALYSIS_INPUT_INSUFFICIENT');
  });

  it('accepts uploaded reference with description', () => {
    const r = assessAnalysisInput({
      url: null,
      assetId: 'asset-1',
      note: '提问开场，痛点到解决方案，引导私信',
    });
    assert.equal(r.sufficient, true);
  });

  it('builds deterministic patterns without provider', () => {
    const out = buildDeterministicReferenceAnalysis({
      referenceContentId: 'ref-1',
      sourceType: 'UPLOAD_VIDEO',
      title: '获客参考',
      userNote: '提问开场，痛点误区到解决方案，快节奏，短句字幕，引导私信咨询',
      reasonForReference: '学习结构',
    });
    assert.equal(out.version, REFERENCE_ANALYSIS_OUTPUT_VERSION);
    assert.ok(out.reusablePatterns.length >= 3);
    assert.ok(out.imitationRisks.length >= 1);
    assert.ok(out.originalityGuidance.includes('不直接复制'));
    assert.equal(JSON.stringify(out).includes('exactScript'), false);
  });

  it('strips direct quote patterns into risks', () => {
    const source = '你还在为没客源发愁吗每天都在想办法';
    const processed = postprocessReferenceAnalysis(
      {
        version: 'v1',
        referenceSummary: '测试',
        reusablePatterns: [
          {
            patternType: 'HOOK',
            key: 'HOOK:copy',
            summary: '你还在为没客源发愁吗每天都在想办法',
            confidence: 'HIGH',
          },
        ],
        imitationRisks: [],
        productionNotes: ['ok'],
        originalityGuidance: '原创',
      },
      source,
    );
    assert.equal(processed.reusablePatterns.length, 0);
    assert.ok(processed.imitationRisks.some((r) => r.code === 'DIRECT_TEXT_COPY'));
  });

  it('detects quote overlap', () => {
    assert.equal(looksLikeDirectQuote('你还在为没客源发愁吗', '开场：你还在为没客源发愁吗然后...'), true);
    assert.equal(looksLikeDirectQuote('抽象提问开场', '完全不同的参考说明文字内容'), false);
  });

  it('validates output and rejects forbidden copy fields', () => {
    assert.throws(
      () =>
        validateReferenceAnalysisOutput({
          version: 'v1',
          referenceSummary: 'x',
          exactScript: 'copy me',
          reusablePatterns: [],
          imitationRisks: [],
          productionNotes: [],
          originalityGuidance: '原创',
        }),
      (err: unknown) => err instanceof AgentError && err.code === ErrorCode.AGENT_INVALID_OUTPUT,
    );
  });

  it('rejects malformed / unknown enum / oversized via validator', () => {
    assert.throws(() => parseAndValidateReferenceAnalysisModelText('{', ''), AgentError);
    assert.throws(
      () =>
        validateReferenceAnalysisOutput({
          version: 'v1',
          referenceSummary: 'x',
          reusablePatterns: [
            { patternType: 'NOT_A_TYPE', key: 'k', summary: 's', confidence: 'MEDIUM' },
          ],
          imitationRisks: [],
          productionNotes: [],
          originalityGuidance: '原创',
        }),
      AgentError,
    );
  });

  it('keeps referenceOnly assets ineligible for production after analysis', () => {
    assert.equal(
      isAssetProductionEligible({
        asset: {
          tenantId: 't1',
          status: 'READY',
          deletedAt: null,
          referenceOnly: true,
          reusable: false,
          rightsStatus: 'REFERENCE_ONLY',
          consentStatus: 'NOT_REQUIRED',
          sourceType: 'REFERENCE',
        },
        callerTenantId: 't1',
      }).eligible,
      false,
    );
  });

  it('computes stable input hash', () => {
    assert.equal(computeReferenceInputHash(['a', 1]), computeReferenceInputHash(['a', 1]));
    assert.notEqual(computeReferenceInputHash(['a', 1]), computeReferenceInputHash(['a', 2]));
  });

  it('exposes bounded context limits', () => {
    assert.equal(REFERENCE_CONTEXT_LIMITS.maxReferences, 3);
    assert.equal(REFERENCE_CONTEXT_LIMITS.maxPatternsTotal, 10);
  });
});
