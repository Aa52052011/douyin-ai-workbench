import { ScriptStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import {
  automatedReviewCannotSubstituteHuman,
  buildHumanReviewEvidence,
  isBlockedScriptApprovalSource,
  isScriptEligibleForProduction,
  parseScriptApprovalSource,
} from './human-approval.js';
import { applyInvalidAutomatedConfirmationCorrection } from './invalid-automated-confirmation.correction.js';

describe('human approval provenance', () => {
  it('without user input records PENDING / NONE / NOT_PROVIDED', () => {
    expect(buildHumanReviewEvidence()).toEqual({
      reviewStatus: 'PENDING',
      reviewer: 'NONE',
      humanDecision: 'NOT_PROVIDED',
    });
  });

  it('does not honor reviewerClaim=HUMAN without a user decision', () => {
    expect(buildHumanReviewEvidence({ reviewerClaim: 'HUMAN' }).reviewer).toBe('NONE');
    expect(buildHumanReviewEvidence({ reviewerClaim: 'HUMAN' }).humanDecision).toBe('NOT_PROVIDED');
  });

  it('records HUMAN only after an explicit user decision', () => {
    expect(buildHumanReviewEvidence({ userDecision: 'YES' })).toEqual({
      reviewStatus: 'COMPLETED',
      reviewer: 'HUMAN',
      humanDecision: 'YES',
    });
  });

  it('treats automated PASS as not a substitute for missing human review', () => {
    const human = buildHumanReviewEvidence();
    expect(
      automatedReviewCannotSubstituteHuman({ overallPass: true, domainPurity: 'PASS' }, human),
    ).toBe(true);
  });
});

describe('script approval source', () => {
  it('blocks Cursor / agent / worker automation sources', () => {
    expect(isBlockedScriptApprovalSource(parseScriptApprovalSource('CURSOR'))).toBe(true);
    expect(isBlockedScriptApprovalSource(parseScriptApprovalSource('AGENT'))).toBe(true);
    expect(isBlockedScriptApprovalSource(parseScriptApprovalSource('QUEUE'))).toBe(true);
    expect(isBlockedScriptApprovalSource(parseScriptApprovalSource('USER_UI'))).toBe(false);
    expect(isBlockedScriptApprovalSource(parseScriptApprovalSource(undefined))).toBe(false);
  });
});

describe('production gate', () => {
  it('blocks DRAFT even if automated review passed', () => {
    expect(isScriptEligibleForProduction('DRAFT')).toBe(false);
    expect(isScriptEligibleForProduction('CONFIRMED')).toBe(true);
    expect(isScriptEligibleForProduction('ARCHIVED')).toBe(false);
  });
});

describe('invalid automated confirmation correction', () => {
  it('reverts CONFIRMED to DRAFT without touching content fields', async () => {
    const row = {
      id: 'script-1',
      tenantId: 'tenant-1',
      status: ScriptStatus.CONFIRMED,
      title: 'keep',
      content: 'body',
      payload: { title: 'keep' },
      topicId: 'topic-1',
      sourceAgentRunId: 'run-1',
      version: 1,
      deletedAt: null,
    };
    const prisma = {
      script: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({ ...row, status: ScriptStatus.DRAFT }),
      },
    };
    const result = await applyInvalidAutomatedConfirmationCorrection(prisma as never, {
      scriptId: 'script-1',
      tenantId: 'tenant-1',
      reason: 'INVALID_AUTOMATED_CONFIRMATION',
    });
    expect(prisma.script.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: 'script-1', tenantId: 'tenant-1' } },
      data: { status: ScriptStatus.DRAFT },
    });
    expect(result.after.status).toBe(ScriptStatus.DRAFT);
    expect(result.after.content).toBe('body');
    expect(result.after.topicId).toBe('topic-1');
    expect(result.after.sourceAgentRunId).toBe('run-1');
    expect(result.after.version).toBe(1);
  });

  it('rejects a non-administrative reason', async () => {
    await expect(
      applyInvalidAutomatedConfirmationCorrection(
        { script: { findFirst: vi.fn(), update: vi.fn() } } as never,
        { scriptId: 'x', tenantId: 't', reason: 'user rejected' as never },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.SCRIPT_CONFLICT });
  });
});
