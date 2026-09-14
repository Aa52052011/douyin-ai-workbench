import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  aggregateTotalsByCurrency,
  computeCost,
  matchPriceRow,
  type PriceRow,
} from './cost-calculator.js';

function row(
  partial: Partial<PriceRow> &
    Pick<PriceRow, 'id' | 'provider' | 'operationType' | 'resourceType' | 'unitType' | 'currency' | 'effectiveFrom'> & {
      pricePerUnit: Prisma.Decimal | string;
    },
): PriceRow {
  return {
    model: null,
    roundingMode: 'EXACT',
    effectiveTo: null,
    ...partial,
    pricePerUnit: new Prisma.Decimal(String(partial.pricePerUnit)),
    unitScale: partial.unitScale ?? new Prisma.Decimal(1),
  };
}

describe('cost-calculator', () => {
  const at = new Date('2026-09-01T00:00:00.000Z');

  it('prices tokens with unitScale (per 1K converted to per-token scale)', () => {
    const price = row({
      id: 'p-token',
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      unitScale: new Prisma.Decimal(1000),
      pricePerUnit: '0.002',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    const cost = computeCost({
      provider: 'router-one',
      units: new Prisma.Decimal(1000),
      unitType: 'TOKENS',
      price,
    });
    expect(cost.status).toBe('ESTIMATED');
    expect(cost.billableCost?.toFixed(6)).toBe('0.002000');
  });

  it('prices per image', () => {
    const price = row({
      id: 'p-img',
      provider: 'wanx',
      operationType: 'IMAGE_GENERATION',
      resourceType: 'AI_IMAGE',
      unitType: 'IMAGES',
      pricePerUnit: '0.0400000000',
      currency: 'CNY',
      effectiveFrom: new Date('2026-01-01'),
    });
    const cost = computeCost({
      provider: 'wanx',
      units: new Prisma.Decimal(2),
      unitType: 'IMAGES',
      price,
    });
    expect(cost.billableCost?.toFixed(6)).toBe('0.080000');
    expect(cost.currency).toBe('CNY');
  });

  it('prices per second', () => {
    const price = row({
      id: 'p-sec',
      provider: 'minimax',
      operationType: 'VOICE_SYNTHESIS',
      resourceType: 'TTS',
      unitType: 'SECONDS',
      pricePerUnit: '0.0100000000',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    const cost = computeCost({
      provider: 'minimax',
      units: new Prisma.Decimal(30),
      unitType: 'SECONDS',
      price,
    });
    expect(cost.billableCost?.toFixed(6)).toBe('0.300000');
  });

  it('selects model-specific then generic fallback', () => {
    const generic = row({
      id: 'generic',
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      pricePerUnit: '0.001',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    const specific = row({
      id: 'specific',
      provider: 'router-one',
      model: 'gpt-test',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      pricePerUnit: '0.009',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    expect(matchPriceRow([generic, specific], {
      provider: 'router-one',
      model: 'gpt-test',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      at,
    })?.id).toBe('specific');
    expect(matchPriceRow([generic, specific], {
      provider: 'router-one',
      model: 'other',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      at,
    })?.id).toBe('generic');
  });

  it('uses effective dates and does not pick future or expired rows', () => {
    const expired = row({
      id: 'old',
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      pricePerUnit: '1',
      currency: 'USD',
      effectiveFrom: new Date('2025-01-01'),
      effectiveTo: new Date('2026-01-01'),
    });
    const current = row({
      id: 'now',
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      pricePerUnit: '2',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    expect(matchPriceRow([expired, current], {
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      at,
    })?.id).toBe('now');
  });

  it('leaves unknown price as UNPRICED nulls, not zero', () => {
    const cost = computeCost({
      provider: 'wanx',
      units: new Prisma.Decimal(1),
      unitType: 'IMAGES',
      price: null,
    });
    expect(cost.status).toBe('UNPRICED');
    expect(cost.billableCost).toBeNull();
    expect(cost.estimatedCost).toBeNull();
    expect(cost.actualCost).toBeNull();
  });

  it('prefers provider actualCost as FINAL', () => {
    const cost = computeCost({
      provider: 'wanx',
      units: new Prisma.Decimal(1),
      unitType: 'IMAGES',
      price: null,
      actualCost: new Prisma.Decimal('0.123456'),
      actualCurrency: 'CNY',
    });
    expect(cost.status).toBe('FINAL');
    expect(cost.actualCost?.toFixed(6)).toBe('0.123456');
    expect(cost.billableCost?.toFixed(6)).toBe('0.123456');
  });

  it('waives mock providers at 0 without pretending they are unpriced', () => {
    const cost = computeCost({
      provider: 'mock',
      units: new Prisma.Decimal(10),
      unitType: 'TOKENS',
      price: null,
    });
    expect(cost.status).toBe('WAIVED');
    expect(cost.billableCost?.toFixed(6)).toBe('0.000000');
  });

  it('does not add mixed currencies together', () => {
    const mixed = aggregateTotalsByCurrency([
      { currency: 'USD', amount: new Prisma.Decimal('0.10') },
      { currency: 'CNY', amount: new Prisma.Decimal('0.80') },
    ]);
    expect(mixed.mixedCurrency).toBe(true);
    expect(mixed.totalsByCurrency).toHaveLength(2);
    expect(mixed.totalsByCurrency.find((item) => item.currency === 'USD')?.totalKnownCost).toBe('0.100000');
  });

  it('uses Decimal money rather than IEEE float', () => {
    const price = row({
      id: 'p-dec',
      provider: 'router-one',
      operationType: 'AGENT_RUN',
      resourceType: 'LLM',
      unitType: 'TOKENS',
      pricePerUnit: '0.0000003000',
      currency: 'USD',
      effectiveFrom: new Date('2026-01-01'),
    });
    const cost = computeCost({
      provider: 'router-one',
      units: new Prisma.Decimal(3),
      unitType: 'TOKENS',
      price,
    });
    expect(cost.billableCost).toBeInstanceOf(Prisma.Decimal);
    expect(cost.billableCost?.toFixed(6)).toBe('0.000001');
  });
});
