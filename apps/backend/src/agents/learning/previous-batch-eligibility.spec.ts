import { describe, expect, it } from 'vitest';
import {
  hasLegitimateRealSucceededBusinessAttempt,
  selectLatestEligiblePreviousBatch,
  type PreviousBatchCandidate,
} from './previous-batch-eligibility.js';

const scope = {
  tenantId: 'tenant-a',
  workspaceId: 'ws-a',
  projectId: 'proj-dogfood',
};

function plan(partial: Partial<PreviousBatchCandidate> & Pick<PreviousBatchCandidate, 'id'>): PreviousBatchCandidate {
  return {
    title: partial.title ?? 'plan',
    tenantId: partial.tenantId ?? scope.tenantId,
    workspaceId: partial.workspaceId ?? scope.workspaceId,
    projectId: partial.projectId ?? scope.projectId,
    sourceAgentRunId: partial.sourceAgentRunId === undefined ? `run-${partial.id}` : partial.sourceAgentRunId,
    createdAt: partial.createdAt ?? new Date('2026-09-10T12:00:00.000Z'),
    agentRunStatus: partial.agentRunStatus ?? 'COMPLETED',
    usageEvents: partial.usageEvents,
    id: partial.id,
  };
}

describe('previous batch eligibility', () => {
  it('injects same tenant/workspace/project real previous plan', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'real-1',
          title: '真实批次',
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm' } }],
        }),
      ],
      scope,
    );
    expect(selected).toEqual({ planId: 'real-1', title: '真实批次' });
  });

  it('does not inject same-project mock-only plan', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'mock-1',
          title: '本批职场成长内容规划',
          usageEvents: [{ provider: 'mock', status: 'SUCCEEDED', metadata: { callKind: 'llm' } }],
        }),
      ],
      scope,
    );
    expect(selected).toBeNull();
  });

  it('selects older eligible real plan when latest is mock', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'mock-latest',
          title: '本批职场成长内容规划',
          createdAt: new Date('2026-09-10T15:00:00.000Z'),
          usageEvents: [{ provider: 'mock', status: 'SUCCEEDED' }],
        }),
        plan({
          id: 'real-older',
          title: '真实历史批次',
          createdAt: new Date('2026-09-10T12:00:00.000Z'),
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm' } }],
        }),
      ],
      scope,
    );
    expect(selected).toEqual({ planId: 'real-older', title: '真实历史批次' });
  });

  it('treats Primary FAILED + Backup SUCCEEDED completed run as eligible', () => {
    expect(
      hasLegitimateRealSucceededBusinessAttempt([
        { provider: 'real', status: 'FAILED', metadata: { callKind: 'llm', fallbackUsed: false } },
        { provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm', fallbackUsed: true } },
      ]),
    ).toBe(true);
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'failover-plan',
          usageEvents: [
            { provider: 'real', status: 'FAILED', metadata: { callKind: 'llm' } },
            { provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm', fallbackUsed: true } },
          ],
        }),
      ],
      scope,
    );
    expect(selected?.planId).toBe('failover-plan');
  });

  it('treats schema-repair multiple real SUCCEEDED usage as eligible', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'repair-plan',
          usageEvents: [
            { provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm' } },
            { provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'llm' } },
          ],
        }),
      ],
      scope,
    );
    expect(selected?.planId).toBe('repair-plan');
  });

  it('excludes sourceAgentRunId null', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'orphan',
          sourceAgentRunId: null,
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED' }],
        }),
      ],
      scope,
    );
    expect(selected).toBeNull();
  });

  it('excludes different project', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'other-proj',
          projectId: 'other',
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED' }],
        }),
      ],
      scope,
    );
    expect(selected).toBeNull();
  });

  it('excludes different workspace', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'other-ws',
          workspaceId: 'other-ws',
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED' }],
        }),
      ],
      scope,
    );
    expect(selected).toBeNull();
  });

  it('excludes different tenant', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: 'other-tenant',
          tenantId: 'other-tenant',
          usageEvents: [{ provider: 'real', status: 'SUCCEEDED' }],
        }),
      ],
      scope,
    );
    expect(selected).toBeNull();
  });

  it('returns null for current Dogfood pattern: mock 职场 plan and no real previous', () => {
    const selected = selectLatestEligiblePreviousBatch(
      [
        plan({
          id: '01a08b48-5ca3-72f0-8e1c-2568f5324d23',
          title: '本批职场成长内容规划',
          projectId: '01a08b3f-9638-7fd1-a1ee-344682fb4809',
          usageEvents: [{ provider: 'mock', status: 'SUCCEEDED' }],
        }),
      ],
      {
        tenantId: 'tenant-a',
        workspaceId: 'ws-a',
        projectId: '01a08b3f-9638-7fd1-a1ee-344682fb4809',
      },
    );
    expect(selected).toBeNull();
  });

  it('does not treat recovery probe success as a business attempt', () => {
    expect(
      hasLegitimateRealSucceededBusinessAttempt([
        { provider: 'real', status: 'SUCCEEDED', metadata: { callKind: 'RECOVERY_PROBE' } },
      ]),
    ).toBe(false);
  });
});
