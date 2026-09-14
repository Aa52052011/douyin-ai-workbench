import { describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { StageContext } from '../pipeline/stage-context.js';
import { QualityGateService } from './quality-gate.service.js';
import type { ProductionQualityResult } from './quality.types.js';

function baseResult(partial: Partial<ProductionQualityResult> & Pick<ProductionQualityResult, 'issues' | 'status' | 'blockingIssueCount'>): ProductionQualityResult {
  return {
    version: 'v1',
    checkedAt: new Date().toISOString(),
    checks: [],
    repairableIssueCount: partial.issues.filter((item) => item.repairable).length,
    attempt: 0,
    finalDisposition: partial.blockingIssueCount > 0 ? 'BLOCKED' : 'FAIL',
    qualityInputHash: 'hash-1',
    durationMs: 1,
    ...partial,
  };
}

function overflowFail(): ProductionQualityResult {
  return baseResult({
    status: 'FAIL',
    blockingIssueCount: 0,
    issues: [
      {
        code: 'SUBTITLE_OVERFLOW_RISK',
        category: 'SUBTITLE',
        severity: 'ERROR',
        scope: 'SUBTITLE',
        message: '字幕可能溢出画面',
        repairable: true,
        suggestedRepairType: 'REBUILD_SUBTITLE',
        deterministic: true,
      },
    ],
  });
}

function passResult(): ProductionQualityResult {
  return baseResult({
    status: 'PASS',
    blockingIssueCount: 0,
    finalDisposition: 'PASS',
    issues: [],
    qualityInputHash: 'hash-pass',
  });
}

function referenceBlocked(): ProductionQualityResult {
  return baseResult({
    status: 'FAIL',
    blockingIssueCount: 1,
    finalDisposition: 'BLOCKED',
    issues: [
      {
        code: 'REFERENCE_ASSET_USED',
        category: 'ASSET_QUALITY',
        severity: 'BLOCKING',
        scope: 'SHOT',
        message: '参考素材不可用于成片',
        repairable: false,
        deterministic: true,
        shotSequence: 1,
        assetId: 'ref-1',
      },
    ],
  });
}

function makeCtx(): StageContext {
  const job = {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 't',
    workspaceId: 'w',
    projectId: 'p',
    output: {
      stages: {},
      usage: { imageCount: 0, audioCharacters: 0, audioSeconds: 0, videoSeconds: 0, estimatedCost: 0 },
    },
  };
  return {
    prisma: {} as never,
    storage: {} as never,
    jobs: {
      mergeOutput: vi.fn(async (_tenant: string, _id: string, output: unknown) => {
        job.output = output as typeof job.output;
      }),
      getById: vi.fn(async () => job),
    } as never,
    job: job as never,
    plan: { videoId: 'v1', targetDuration: 8, fps: 30, scenes: [] } as never,
    generationVersion: 'g1',
  };
}

describe('QualityGateService live loop', () => {
  it('repairs subtitle overflow then PASS without provider calls', async () => {
    let n = 0;
    const checks = {
      evaluate: vi.fn(async () => {
        n += 1;
        return n === 1 ? overflowFail() : passResult();
      }),
    };
    const repairs = {
      execute: vi.fn(async () => ({
        composeAssetId: 'a2',
        duration: 8,
        width: 1080,
        height: 1920,
        afterHash: 'after',
        providerCalls: 0,
        reusedVoice: true,
      })),
    };
    const gate = new QualityGateService(checks as never, repairs as never);
    const out = await gate.run(makeCtx(), { assetId: 'a1', duration: 8, width: 1080, height: 1920 });
    expect(out.checkpoint.qualityDisposition).toBe('PASS');
    expect(out.checkpoint.repairHistory).toHaveLength(1);
    expect(out.checkpoint.repairHistory[0]?.providerCalls).toBe(0);
    expect(repairs.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(repairs.execute.mock.calls)).not.toMatch(/Wanx|MiniMax|wanx|minimax/i);
  });

  it('BLOCKED on injected reference asset and denies finalize', async () => {
    const checks = { evaluate: vi.fn(async () => referenceBlocked()) };
    const repairs = { execute: vi.fn() };
    const gate = new QualityGateService(checks as never, repairs as never);
    await expect(gate.run(makeCtx(), { assetId: 'a1', duration: 8, width: 1080, height: 1920 })).rejects.toMatchObject({
      code: ErrorCode.QUALITY_GATE_BLOCKED,
    });
    expect(repairs.execute).not.toHaveBeenCalled();
  });

  it('BEST_AVAILABLE when nonblocking overflow remains after repair budget', async () => {
    const checks = { evaluate: vi.fn(async () => overflowFail()) };
    const repairs = {
      execute: vi.fn(async () => ({
        composeAssetId: 'a1',
        duration: 8,
        width: 1080,
        height: 1920,
        afterHash: 'same',
        providerCalls: 0,
        reusedVoice: true,
      })),
    };
    const gate = new QualityGateService(checks as never, repairs as never);
    const out = await gate.run(makeCtx(), { assetId: 'a1', duration: 8, width: 1080, height: 1920 });
    expect(out.checkpoint.qualityDisposition).toBe('BEST_AVAILABLE');
    expect(repairs.execute).toHaveBeenCalled();
    expect(out.checkpoint.repairHistory.every((item) => item.providerCalls === 0)).toBe(true);
  });

  it('rethrows QUALITY_GATE_BLOCKED as AppError', async () => {
    const checks = { evaluate: vi.fn(async () => referenceBlocked()) };
    const gate = new QualityGateService(checks as never, { execute: vi.fn() } as never);
    try {
      await gate.run(makeCtx(), { assetId: 'a1', duration: 8, width: 1080, height: 1920 });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.QUALITY_GATE_BLOCKED);
    }
  });
});
