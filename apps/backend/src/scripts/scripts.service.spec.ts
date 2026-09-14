import { ScriptStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { ScriptsService } from './scripts.service.js';

const SCRIPT_ID = '01a08c1d-46ce-7951-82ed-2eddd2394faa';
const TENANT = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
const WORKSPACE = '01a08b24-3e55-7022-82c1-7bfa494e755b';
const auth = { tenantId: TENANT, workspaceId: WORKSPACE, userId: 'user-1', role: 'OWNER' };

function draftRow() {
  return {
    id: SCRIPT_ID,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    projectId: 'proj',
    status: ScriptStatus.DRAFT,
    title: 't',
    content: 'c',
    version: 1,
    payload: {},
    topicSnapshot: {},
    topicId: 'topic',
    contentPlanId: 'plan',
    sourceAgentRunId: 'run',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('ScriptsService.confirm human gate', () => {
  const prisma = {
    script: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const memory = { refreshMemorySafe: vi.fn() };
  let service: ScriptsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ScriptsService(prisma as never, {} as never, memory as never, {} as never);
  });

  it('rejects Cursor / automation approval sources', async () => {
    prisma.script.findFirst.mockResolvedValue(draftRow());
    await expect(service.confirm(auth as never, SCRIPT_ID, undefined, { approvalSource: 'CURSOR' })).rejects.toMatchObject(
      { code: ErrorCode.SCRIPT_CONFIRM_NOT_HUMAN },
    );
    expect(prisma.script.update).not.toHaveBeenCalled();
  });

  it('confirms DRAFT via explicit authenticated confirm without automation source', async () => {
    const row = draftRow();
    prisma.script.findFirst.mockResolvedValue(row);
    prisma.script.update.mockResolvedValue({ ...row, status: ScriptStatus.CONFIRMED });
    const result = await service.confirm(auth as never, SCRIPT_ID);
    expect(result.status).toBe('CONFIRMED');
    expect(prisma.script.update).toHaveBeenCalled();
  });
});

describe('ScriptsService.createVersionedRow never auto-confirms', () => {
  it('createVersionedRow writes DRAFT only', async () => {
    const created = {
      id: SCRIPT_ID,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      projectId: 'proj',
      status: ScriptStatus.DRAFT,
      title: 't',
      content: 'c',
      version: 1,
      payload: {},
      topicSnapshot: {},
      topicId: 'topic',
      contentPlanId: 'plan',
      sourceAgentRunId: 'run',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const prisma = {
      script: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const service = new ScriptsService(prisma as never, {} as never, { refreshMemorySafe: vi.fn() } as never, {} as never);
    const result = await (
      service as unknown as {
        createVersionedRow: (data: Record<string, unknown>) => Promise<{ status: string }>;
      }
    ).createVersionedRow({
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      projectId: 'proj',
      contentPlanId: 'plan',
      topicId: 'topic',
      title: 't',
      content: 'c',
      payload: {},
      topicSnapshot: {},
      sourceAgentRunId: 'run',
    });
    expect(prisma.script.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ScriptStatus.DRAFT }),
      }),
    );
    expect(result.status).toBe('DRAFT');
  });
});
