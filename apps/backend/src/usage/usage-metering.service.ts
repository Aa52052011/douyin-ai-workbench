import { Injectable, Logger } from '@nestjs/common';
import {
  CostLedgerStatus,
  Prisma,
  PrismaClient,
  UsageEventStatus,
  UsageOperationType,
  UsageResourceType,
  UsageUnitType,
} from '@prisma/client';
import { computeCost, matchPriceRow, toDecimal, type PriceRow } from './cost-calculator.js';
import { COST_CALCULATION_VERSION, type CompleteUsageUnits, type StartUsageInput, type UsageCostSummary } from './usage.types.js';

const SAFE_META = new Set([
  'stage',
  'generationVersion',
  'repairAttempt',
  'repairIssueCode',
  'width',
  'height',
  'duration',
  'attempt',
  'callKind',
  'billable',
  'sceneSequence',
  'reason',
  'inputAssetCount',
  'routeKey',
  'model',
  'fallbackUsed',
  'failoverReason',
  'primaryFailureReason',
  'primarySkipped',
  'skipReason',
  'selectedRoute',
]);

@Injectable()
export class UsageMeteringService {
  private readonly logger = new Logger(UsageMeteringService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async startUsage(input: StartUsageInput): Promise<{ id: string; reused: boolean }> {
    const metadata = sanitizeMetadata(input.metadata);
    try {
      const created = await this.prisma.usageEvent.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          userId: input.userId,
          videoId: input.videoId,
          jobId: input.jobId,
          agentRunId: input.agentRunId,
          operationType: asOperation(input.operationType),
          provider: input.provider,
          model: input.model,
          resourceType: asResource(input.resourceType),
          status: UsageEventStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
          metadata,
        },
        select: { id: true },
      });
      this.logEvent({
        event: 'usage_start',
        usageEventId: created.id,
        provider: input.provider,
        resourceType: input.resourceType,
        operationType: input.operationType,
        status: 'PENDING',
        videoId: input.videoId,
        jobId: input.jobId,
        idempotencyKey: input.idempotencyKey.slice(0, 24),
      });
      return { id: created.id, reused: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.usageEvent.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
          select: { id: true, status: true },
        });
        if (existing?.status === UsageEventStatus.PENDING) {
          return { id: existing.id, reused: true };
        }
        if (existing) {
          throw new Error('USAGE_ATTEMPT_KEY_TERMINAL');
        }
      }
      throw error;
    }
  }

  async completeUsage(tenantId: string, usageEventId: string, units: CompleteUsageUnits): Promise<void> {
    const current = await this.prisma.usageEvent.findFirst({
      where: { id: usageEventId, tenantId },
    });
    if (!current || current.status !== UsageEventStatus.PENDING) {
      return;
    }
    const now = new Date();
    const unitType = units.unitType ? asUnit(units.unitType) : current.unitType;
    const updated = await this.prisma.usageEvent.update({
      where: { id_tenantId: { id: usageEventId, tenantId } },
      data: {
        status: UsageEventStatus.SUCCEEDED,
        completedAt: now,
        inputUnits: toDecimal(units.inputUnits ?? null) ?? undefined,
        outputUnits: toDecimal(units.outputUnits ?? null) ?? undefined,
        totalUnits: toDecimal(units.totalUnits ?? null) ?? undefined,
        unitType,
        durationSeconds: toDecimal(units.durationSeconds ?? null) ?? undefined,
        imageCount: units.imageCount ?? undefined,
        videoSeconds: toDecimal(units.videoSeconds ?? null) ?? undefined,
        characterCount: units.characterCount ?? undefined,
        storageBytes: units.storageBytes != null ? BigInt(units.storageBytes) : undefined,
        computeMs: units.computeMs ?? undefined,
        providerRequestId: units.providerRequestId ?? undefined,
      },
    });
    await this.writeCost(updated, {
      actualCost: toDecimal(units.actualCost ?? null),
      actualCurrency: units.actualCurrency ?? null,
      at: updated.createdAt,
    });
    this.logEvent({
      event: 'usage_complete',
      usageEventId,
      provider: updated.provider,
      resourceType: updated.resourceType,
      operationType: updated.operationType,
      status: 'SUCCEEDED',
      units: String(updated.totalUnits ?? updated.inputUnits ?? ''),
      unitType: updated.unitType,
      videoId: updated.videoId,
      jobId: updated.jobId,
    });
  }

  async failUsage(tenantId: string, usageEventId: string): Promise<void> {
    const current = await this.prisma.usageEvent.findFirst({ where: { id: usageEventId, tenantId } });
    if (!current || current.status !== UsageEventStatus.PENDING) {
      return;
    }
    const updated = await this.prisma.usageEvent.update({
      where: { id_tenantId: { id: usageEventId, tenantId } },
      data: { status: UsageEventStatus.FAILED, completedAt: new Date() },
    });
    await this.writeCost(updated, { actualCost: null, actualCurrency: null, at: updated.createdAt });
    this.logEvent({
      event: 'usage_failed',
      usageEventId,
      provider: updated.provider,
      resourceType: updated.resourceType,
      operationType: updated.operationType,
      status: 'FAILED',
      videoId: updated.videoId,
      jobId: updated.jobId,
    });
  }

  async recordUsage(input: StartUsageInput, units: CompleteUsageUnits): Promise<{ id: string }> {
    const started = await this.startUsage(input);
    await this.completeUsage(input.tenantId, started.id, units);
    return { id: started.id };
  }

  async calculateCostForEvent(tenantId: string, usageEventId: string) {
    const event = await this.prisma.usageEvent.findFirst({ where: { id: usageEventId, tenantId } });
    if (!event) {
      return null;
    }
    return this.prisma.costLedger.findUnique({ where: { usageEventId: event.id } });
  }

  async getProjectUsageSummary(tenantId: string, projectId: string): Promise<UsageCostSummary> {
    return this.summarize({ tenantId, projectId });
  }

  async getVideoUsageSummary(tenantId: string, videoId: string): Promise<UsageCostSummary> {
    return this.summarize({ tenantId, videoId });
  }

  async getJobUsageSummary(tenantId: string, jobId: string): Promise<UsageCostSummary> {
    return this.summarize({ tenantId, jobId });
  }

  async getProjectCostSummary(tenantId: string, projectId: string): Promise<UsageCostSummary> {
    return this.getProjectUsageSummary(tenantId, projectId);
  }

  async getVideoCostSummary(tenantId: string, videoId: string): Promise<UsageCostSummary> {
    return this.getVideoUsageSummary(tenantId, videoId);
  }

  async getJobCostSummary(tenantId: string, jobId: string): Promise<UsageCostSummary> {
    return this.getJobUsageSummary(tenantId, jobId);
  }

  /** Skeleton for future AgentRun/Job/providerRequestId gap fill. */
  async reconcileUsage(): Promise<{ scanned: number; repaired: number }> {
    return { scanned: 0, repaired: 0 };
  }

  toPublicSummary(summary: UsageCostSummary) {
    return {
      usageCount: summary.usageCount,
      unpricedUsageCount: summary.unpricedUsageCount,
      totalsByCurrency: summary.totalsByCurrency,
      mixedCurrency: summary.mixedCurrency,
      breakdownByResource: summary.breakdownByResource,
      breakdownByProvider: summary.breakdownByProvider.map((item) => ({
        provider: item.provider,
        count: item.count,
      })),
      breakdownByOperation: summary.breakdownByOperation,
    };
  }

  private async summarize(where: { tenantId: string; projectId?: string; videoId?: string; jobId?: string }): Promise<UsageCostSummary> {
    const events = await this.prisma.usageEvent.findMany({
      where,
      include: { costLedger: true },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });
    const unpricedUsageCount = events.filter(
      (item) => !item.costLedger || item.costLedger.status === CostLedgerStatus.UNPRICED,
    ).length;
    const { totalsByCurrency, mixedCurrency } = aggregateKnown(events);
    return {
      usageCount: events.length,
      unpricedUsageCount,
      totalsByCurrency,
      mixedCurrency,
      breakdownByResource: resourceBreakdown(events),
      breakdownByProvider: countBy(events.map((item) => item.provider)).map((item) => ({
        provider: item.key,
        count: item.count,
      })),
      breakdownByOperation: countBy(events.map((item) => item.operationType)).map((item) => ({
        operationType: item.key,
        count: item.count,
      })),
    };
  }

  private async writeCost(
    event: {
      id: string;
      tenantId: string;
      workspaceId: string;
      projectId: string | null;
      videoId: string | null;
      jobId: string | null;
      provider: string;
      model: string | null;
      operationType: UsageOperationType;
      resourceType: UsageResourceType;
      unitType: UsageUnitType | null;
      totalUnits: Prisma.Decimal | null;
      inputUnits: Prisma.Decimal | null;
      createdAt: Date;
      metadata: Prisma.JsonValue;
    },
    billed: { actualCost: Prisma.Decimal | null; actualCurrency: string | null; at: Date },
  ) {
    const existing = await this.prisma.costLedger.findUnique({ where: { usageEventId: event.id } });
    if (existing) {
      return;
    }
    const unitType = event.unitType;
    const rows =
      unitType != null
        ? await this.prisma.providerPriceCatalog.findMany({
            where: {
              provider: event.provider,
              operationType: event.operationType,
              resourceType: event.resourceType,
              unitType,
            },
          })
        : [];
    const price = unitType
      ? matchPriceRow(rows as PriceRow[], {
          provider: event.provider,
          model: event.model,
          operationType: event.operationType,
          resourceType: event.resourceType,
          unitType,
          at: billed.at,
        })
      : null;
    const meta = asMeta(event.metadata);
    const computed = computeCost({
      provider: event.provider,
      units: event.totalUnits ?? event.inputUnits,
      unitType,
      price,
      actualCost: billed.actualCost,
      actualCurrency: billed.actualCurrency,
      waived: meta.billable === false,
    });
    await this.prisma.costLedger.create({
      data: {
        tenantId: event.tenantId,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        videoId: event.videoId,
        jobId: event.jobId,
        usageEventId: event.id,
        provider: event.provider,
        operationType: event.operationType,
        currency: computed.currency,
        estimatedCost: computed.estimatedCost ?? undefined,
        actualCost: computed.actualCost ?? undefined,
        billableCost: computed.billableCost ?? undefined,
        status: computed.status as CostLedgerStatus,
        calculationVersion: COST_CALCULATION_VERSION,
        priceCatalogId: computed.priceCatalogId,
        metadata: { calculationVersion: COST_CALCULATION_VERSION },
      },
    });
    this.logEvent({
      event: 'cost_written',
      usageEventId: event.id,
      provider: event.provider,
      costStatus: computed.status,
      currency: computed.currency,
    });
  }

  private logEvent(payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify(payload));
  }
}

function sanitizeMetadata(input?: Record<string, string | number | boolean | null>): Prisma.InputJsonValue {
  const next: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!SAFE_META.has(key)) {
      continue;
    }
    if (/secret|authorization|apiKey|token|prompt|script|transcript/i.test(key)) {
      continue;
    }
    next[key] = value;
  }
  return next as Prisma.InputJsonValue;
}

function asMeta(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function aggregateKnown(
  events: Array<{ costLedger: { currency: string | null; billableCost: Prisma.Decimal | null; estimatedCost: Prisma.Decimal | null; actualCost: Prisma.Decimal | null; status: CostLedgerStatus } | null }>,
): { totalsByCurrency: Array<{ currency: string; totalKnownCost: string }>; mixedCurrency: boolean } {
  const map = new Map<string, Prisma.Decimal>();
  for (const event of events) {
    const ledger = event.costLedger;
    if (!ledger || ledger.status === CostLedgerStatus.UNPRICED) {
      continue;
    }
    const amount = ledger.actualCost ?? ledger.billableCost ?? ledger.estimatedCost;
    if (!ledger.currency || amount == null) {
      continue;
    }
    map.set(ledger.currency, (map.get(ledger.currency) ?? new Prisma.Decimal(0)).plus(amount));
  }
  const totalsByCurrency = [...map.entries()].map(([currency, total]) => ({
    currency,
    totalKnownCost: total.toFixed(6),
  }));
  return { totalsByCurrency, mixedCurrency: totalsByCurrency.length > 1 };
}

function resourceBreakdown(
  events: Array<{
    resourceType: string;
    inputUnits: Prisma.Decimal | null;
    outputUnits: Prisma.Decimal | null;
    imageCount: number | null;
    characterCount: number | null;
    computeMs: number | null;
    durationSeconds: Prisma.Decimal | null;
  }>,
): UsageCostSummary['breakdownByResource'] {
  const map = new Map<
    string,
    {
      count: number;
      inputUnits: Prisma.Decimal;
      outputUnits: Prisma.Decimal;
      imageCount: number;
      characterCount: number;
      computeMs: number;
      durationSeconds: Prisma.Decimal;
    }
  >();
  for (const event of events) {
    const current = map.get(event.resourceType) ?? {
      count: 0,
      inputUnits: new Prisma.Decimal(0),
      outputUnits: new Prisma.Decimal(0),
      imageCount: 0,
      characterCount: 0,
      computeMs: 0,
      durationSeconds: new Prisma.Decimal(0),
    };
    current.count += 1;
    if (event.inputUnits) {
      current.inputUnits = current.inputUnits.plus(event.inputUnits);
    }
    if (event.outputUnits) {
      current.outputUnits = current.outputUnits.plus(event.outputUnits);
    }
    current.imageCount += event.imageCount ?? 0;
    current.characterCount += event.characterCount ?? 0;
    current.computeMs += event.computeMs ?? 0;
    if (event.durationSeconds) {
      current.durationSeconds = current.durationSeconds.plus(event.durationSeconds);
    }
    map.set(event.resourceType, current);
  }
  return [...map.entries()].map(([resourceType, value]) => ({
    resourceType,
    count: value.count,
    inputUnits: value.inputUnits.toFixed(6),
    outputUnits: value.outputUnits.toFixed(6),
    imageCount: value.imageCount,
    characterCount: value.characterCount,
    computeMs: value.computeMs,
    durationSeconds: value.durationSeconds.toFixed(6),
  }));
}

function countBy(values: string[]): Array<{ key: string; count: number; resourceType?: string }> {
  const map = new Map<string, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count, resourceType: key }));
}

function asOperation(value: string): UsageOperationType {
  return (UsageOperationType as Record<string, UsageOperationType>)[value] ?? UsageOperationType.OTHER;
}

function asResource(value: string): UsageResourceType {
  return (UsageResourceType as Record<string, UsageResourceType>)[value] ?? UsageResourceType.OTHER;
}

function asUnit(value: string): UsageUnitType {
  return (UsageUnitType as Record<string, UsageUnitType>)[value] ?? UsageUnitType.UNITS;
}
