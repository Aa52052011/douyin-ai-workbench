import type { PrismaClient, Script } from '@prisma/client';
import { ScriptStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { INVALID_AUTOMATED_CONFIRMATION } from './human-approval.js';

export type InvalidAutomatedConfirmationCorrection = {
  scriptId: string;
  tenantId: string;
  reason: typeof INVALID_AUTOMATED_CONFIRMATION;
};

/**
 * Administrative state correction only.
 * Not a user unconfirm / reject / change-of-mind.
 * Does not mutate script body, topic, version, or sourceAgentRunId.
 */
export async function applyInvalidAutomatedConfirmationCorrection(
  prisma: PrismaClient,
  input: InvalidAutomatedConfirmationCorrection,
): Promise<{ before: Script; after: Script }> {
  if (input.reason !== INVALID_AUTOMATED_CONFIRMATION) {
    throw new AppError(ErrorCode.SCRIPT_CONFLICT, 'Administrative correction reason is invalid');
  }
  const before = await prisma.script.findFirst({
    where: { id: input.scriptId, tenantId: input.tenantId, deletedAt: null },
  });
  if (!before) {
    throw new AppError(ErrorCode.SCRIPT_NOT_FOUND);
  }
  if (before.status !== ScriptStatus.CONFIRMED) {
    throw new AppError(ErrorCode.SCRIPT_CONFLICT);
  }
  const after = await prisma.script.update({
    where: { id_tenantId: { id: before.id, tenantId: input.tenantId } },
    data: { status: ScriptStatus.DRAFT },
  });
  return { before, after };
}
