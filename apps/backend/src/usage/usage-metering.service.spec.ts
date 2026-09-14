import { randomUUID } from 'node:crypto';
import {
  CostLedgerStatus,
  Prisma,
  UsageEventStatus,
  UsageOperationType,
  UsageResourceType,
  UsageUnitType,
  type PrismaClient,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { UsageMeteringService } from './usage-metering.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const PROJECT = '44444444-4444-4444-8444-444444444444';
const VIDEO = '55555555-5555-4555-8555-555555555555';

type EventRow = Record<string, unknown> & { id: string; tenantId: string; idempotencyKey: string };
type LedgerRow = Record<string, unknown> & { id: string; usageEventId: string };
type PriceRow = Record<string, unknown> & { id: string };

function mockDb() {
  const events: EventRow[] = [];
  const ledgers: LedgerRow[] = [];
  const prices: PriceRow[] = [];
  const prisma = {
    usageEvent: {
      create: async ({ data, select }: { data: Record<string, unknown>; select?: { id: true } }) => {
        if (events.some((item) => item.tenantId === data.tenantId && item.idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: EventRow = {
          id: randomUUID(),
          status: UsageEventStatus.PENDING,
          metadata: {},
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          completedAt: null,
          inputUnits: null,
          outputUnits: null,
          totalUnits: null,
          unitType: null,
          durationSeconds: null,
          imageCount: null,
          videoSeconds: null,
          characterCount: null,
          storageBytes: null,
          computeMs: null,
          providerRequestId: null,
          model: null,
          projectId: null,
          videoId: null,
          jobId: null,
          ...data,
        };
        events.push(row);
        return select?.id ? { id: row.id } : row;
      },
      findUnique: async ({ where }: { where: { tenantId_idempotencyKey: { tenantId: string; idempotencyKey: string } } }) => {
        return events.find(
          (item) =>
            item.tenantId === where.tenantId_idempotencyKey.tenantId &&
            item.idempotencyKey === where.tenantId_idempotencyKey.idempotencyKey,
        ) ?? null;
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        return events.find((item) => item.id === where.id && item.tenantId === where.tenantId) ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id_tenantId: { id: string; tenantId: string } };
        data: Record<string, unknown>;
      }) => {
        const row = events.find((item) => item.id === where.id_tenantId.id && item.tenantId === where.id_tenantId.tenantId);
        if (!row) {
          throw new Error('missing event');
        }
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: { where: { tenantId: string; projectId?: string; videoId?: string } }) => {
        return events
          .filter((item) => item.tenantId === where.tenantId)
          .filter((item) => (where.projectId ? item.projectId === where.projectId : true))
          .filter((item) => (where.videoId ? item.videoId === where.videoId : true))
          .map((item) => ({
            ...item,
            costLedger: ledgers.find((ledger) => ledger.usageEventId === item.id) ?? null,
          }));
      },
    },
    costLedger: {
      findUnique: async ({ where }: { where: { usageEventId: string } }) => {
        return ledgers.find((item) => item.usageEventId === where.usageEventId) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (ledgers.some((item) => item.usageEventId === data.usageEventId)) {
          throw new Error('duplicate ledger');
        }
        const row: LedgerRow = { id: randomUUID(), ...data };
        ledgers.push(row);
        return row;
      },
    },
    providerPriceCatalog: {
      findMany: async ({
        where,
      }: {
        where: { provider: string; operationType: string; resourceType: string; unitType: string };
      }) => prices.filter((item) => item.provider === where.provider && item.unitType === where.unitType),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, events, ledgers, prices };
}

describe('UsageMeteringService', () => {
  it('is idempotent on the same tenant+key', async () => {
    const { prisma, events } = mockDb();
    const service = new UsageMeteringService(prisma);
    const input = {
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:run-1',
    };
    const first = await service.startUsage(input);
    const second = await service.startUsage(input);
    expect(first.id).toBe(second.id);
    expect(second.reused).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('does not reuse a terminal UsageEvent for a new start with the same key', async () => {
    const { prisma, events } = mockDb();
    const service = new UsageMeteringService(prisma);
    const input = {
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:attempt-terminal',
    };
    const first = await service.startUsage(input);
    await service.failUsage(TENANT_A, first.id);
    await expect(service.startUsage(input)).rejects.toThrow('USAGE_ATTEMPT_KEY_TERMINAL');
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe(UsageEventStatus.FAILED);
  });

  it('records failed then successful attempts as two events and two ledgers', async () => {
    const { prisma, events, ledgers } = mockDb();
    const service = new UsageMeteringService(prisma);
    const failed = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:attempt-1',
    });
    await service.failUsage(TENANT_A, failed.id);
    const ok = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:attempt-2',
    });
    await service.completeUsage(TENANT_A, ok.id, {
      totalUnits: 3,
      unitType: UsageUnitType.TOKENS,
    });
    expect(events.map((item) => item.status)).toEqual([UsageEventStatus.FAILED, UsageEventStatus.SUCCEEDED]);
    expect(ledgers).toHaveLength(2);
    expect(ledgers[0]?.usageEventId).toBe(failed.id);
    expect(ledgers[1]?.usageEventId).toBe(ok.id);
    expect(ledgers[0]?.status).toBe(CostLedgerStatus.UNPRICED);
    expect(ledgers[1]?.status).toBe(CostLedgerStatus.UNPRICED);
  });

  it('records two timeouts as two FAILED rows', async () => {
    const { prisma, events } = mockDb();
    const service = new UsageMeteringService(prisma);
    const a = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:timeout-1',
    });
    await service.failUsage(TENANT_A, a.id);
    const b = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:timeout-2',
    });
    await service.failUsage(TENANT_A, b.id);
    expect(events).toHaveLength(2);
    expect(events.every((item) => item.status === UsageEventStatus.FAILED)).toBe(true);
  });

  it('creates a second event for a different real attempt key', async () => {
    const { prisma, events } = mockDb();
    const service = new UsageMeteringService(prisma);
    await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:primary',
    });
    await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:repair',
    });
    expect(events).toHaveLength(2);
  });

  it('does not treat unknown price as zero and does not auto-zero failed usage', async () => {
    const { prisma, ledgers } = mockDb();
    const service = new UsageMeteringService(prisma);
    const started = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.IMAGE_GENERATION,
      provider: 'wanx',
      resourceType: UsageResourceType.AI_IMAGE,
      idempotencyKey: 'img:1',
    });
    await service.failUsage(TENANT_A, started.id);
    expect(ledgers[0]?.status).toBe(CostLedgerStatus.UNPRICED);
    expect(ledgers[0]?.billableCost).toBeUndefined();
  });

  it('stores Decimal costs from fixture catalog and keeps historical ledger on new prices', async () => {
    const { prisma, prices, ledgers } = mockDb();
    prices.push({
      id: 'cat-old',
      provider: 'router-one',
      model: null,
      operationType: UsageOperationType.AGENT_RUN,
      resourceType: UsageResourceType.LLM,
      unitType: UsageUnitType.TOKENS,
      unitScale: new Prisma.Decimal(1),
      pricePerUnit: new Prisma.Decimal('0.001'),
      currency: 'USD',
      roundingMode: 'EXACT',
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
    });
    const service = new UsageMeteringService(prisma);
    const started = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      projectId: PROJECT,
      videoId: VIDEO,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'llm:priced',
    });
    await service.completeUsage(TENANT_A, started.id, {
      inputUnits: 10,
      outputUnits: 5,
      totalUnits: 15,
      unitType: UsageUnitType.TOKENS,
    });
    expect(ledgers[0]?.status).toBe(CostLedgerStatus.ESTIMATED);
    expect(ledgers[0]?.billableCost).toBeInstanceOf(Prisma.Decimal);
    expect((ledgers[0]?.billableCost as Prisma.Decimal).toFixed(6)).toBe('0.015000');
    expect(ledgers[0]?.priceCatalogId).toBe('cat-old');
    prices[0]!.pricePerUnit = new Prisma.Decimal('9');
    await service.completeUsage(TENANT_A, started.id, { totalUnits: 15, unitType: UsageUnitType.TOKENS });
    expect(ledgers).toHaveLength(1);
    expect((ledgers[0]?.billableCost as Prisma.Decimal).toFixed(6)).toBe('0.015000');
  });

  it('isolates tenant summaries and mixed currencies', async () => {
    const { prisma, prices } = mockDb();
    prices.push(
      {
        id: 'usd',
        provider: 'router-one',
        model: null,
        operationType: UsageOperationType.AGENT_RUN,
        resourceType: UsageResourceType.LLM,
        unitType: UsageUnitType.TOKENS,
        unitScale: new Prisma.Decimal(1),
        pricePerUnit: new Prisma.Decimal('0.001'),
        currency: 'USD',
        roundingMode: 'EXACT',
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: null,
      },
      {
        id: 'cny',
        provider: 'wanx',
        model: null,
        operationType: UsageOperationType.IMAGE_GENERATION,
        resourceType: UsageResourceType.AI_IMAGE,
        unitType: UsageUnitType.IMAGES,
        unitScale: new Prisma.Decimal(1),
        pricePerUnit: new Prisma.Decimal('0.04'),
        currency: 'CNY',
        roundingMode: 'EXACT',
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: null,
      },
    );
    const service = new UsageMeteringService(prisma);
    const aLlm = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      projectId: PROJECT,
      videoId: VIDEO,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'a-llm',
    });
    await service.completeUsage(TENANT_A, aLlm.id, { totalUnits: 100, unitType: UsageUnitType.TOKENS });
    const aImg = await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      projectId: PROJECT,
      videoId: VIDEO,
      operationType: UsageOperationType.IMAGE_GENERATION,
      provider: 'wanx',
      resourceType: UsageResourceType.AI_IMAGE,
      idempotencyKey: 'a-img',
    });
    await service.completeUsage(TENANT_A, aImg.id, { totalUnits: 1, imageCount: 1, unitType: UsageUnitType.IMAGES });
    const b = await service.startUsage({
      tenantId: TENANT_B,
      workspaceId: WS,
      projectId: PROJECT,
      videoId: VIDEO,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'b-llm',
    });
    await service.completeUsage(TENANT_B, b.id, { totalUnits: 999, unitType: UsageUnitType.TOKENS });

    const video = await service.getVideoUsageSummary(TENANT_A, VIDEO);
    expect(video.usageCount).toBe(2);
    expect(video.mixedCurrency).toBe(true);
    expect(video.totalsByCurrency.map((item) => item.currency).sort()).toEqual(['CNY', 'USD']);
    const leaked = await service.getVideoUsageSummary(TENANT_B, VIDEO);
    expect(leaked.usageCount).toBe(1);
    const publicSummary = service.toPublicSummary(video);
    const json = JSON.stringify(publicSummary);
    expect(json).not.toMatch(/apiKey|Authorization|storageKey|prompt/i);
    expect(publicSummary.breakdownByProvider[0]).toEqual(
      expect.objectContaining({ provider: expect.any(String), count: expect.any(Number) }),
    );
  });

  it('strips secrets from metadata', async () => {
    const { prisma, events } = mockDb();
    const service = new UsageMeteringService(prisma);
    await service.startUsage({
      tenantId: TENANT_A,
      workspaceId: WS,
      operationType: UsageOperationType.AGENT_RUN,
      provider: 'router-one',
      resourceType: UsageResourceType.LLM,
      idempotencyKey: 'meta',
      metadata: {
        stage: 'AGENT',
        apiKey: 'sk-secret',
        prompt: 'full prompt',
        generationVersion: 'g1',
        routeKey: 'real::openai/gpt-5.5',
        fallbackUsed: true,
      } as never,
    });
    expect(events[0]?.metadata).toEqual({
      stage: 'AGENT',
      generationVersion: 'g1',
      routeKey: 'real::openai/gpt-5.5',
      fallbackUsed: true,
    });
  });

  it('reserves MARKET_RESEARCH and PERFORMANCE_LEARNING without emitting events in this step', () => {
    expect(UsageOperationType.MARKET_RESEARCH).toBe('MARKET_RESEARCH');
    expect(UsageOperationType.PERFORMANCE_LEARNING).toBe('PERFORMANCE_LEARNING');
  });
});
