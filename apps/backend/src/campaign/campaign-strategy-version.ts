import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';

export function nextCampaignStrategyVersion(lastVersion: number | null | undefined): number {
  return (lastVersion ?? 0) + 1;
}

export async function allocateCampaignStrategyVersion(
  prisma: PrismaClient,
  scope: { tenantId: string; projectId: string },
): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const last = await tx.campaignStrategy.findFirst({
            where: { tenantId: scope.tenantId, projectId: scope.projectId },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          return nextCampaignStrategyVersion(last?.version);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034') &&
        attempt < 4
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to allocate campaign strategy version');
}
