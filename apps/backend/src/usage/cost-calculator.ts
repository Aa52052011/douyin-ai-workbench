import { Prisma } from '@prisma/client';
import { COST_CALCULATION_VERSION, MOCK_PROVIDER_IDS } from './usage.types.js';

export type PriceRow = {
  id: string;
  provider: string;
  model: string | null;
  operationType: string;
  resourceType: string;
  unitType: string;
  unitScale: Prisma.Decimal;
  pricePerUnit: Prisma.Decimal;
  currency: string;
  roundingMode: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type CostComputation = {
  status: 'ESTIMATED' | 'FINAL' | 'UNPRICED' | 'WAIVED';
  currency: string | null;
  estimatedCost: Prisma.Decimal | null;
  actualCost: Prisma.Decimal | null;
  billableCost: Prisma.Decimal | null;
  priceCatalogId: string | null;
  calculationVersion: string;
};

export function isMockProvider(provider: string): boolean {
  return MOCK_PROVIDER_IDS.has(provider) || provider.startsWith('mock');
}

export function matchPriceRow(
  rows: PriceRow[],
  input: {
    provider: string;
    model?: string | null;
    operationType: string;
    resourceType: string;
    unitType: string;
    at: Date;
  },
): PriceRow | null {
  const active = rows.filter((row) => {
    if (row.provider !== input.provider) {
      return false;
    }
    if (row.operationType !== input.operationType) {
      return false;
    }
    if (row.resourceType !== input.resourceType) {
      return false;
    }
    if (row.unitType !== input.unitType) {
      return false;
    }
    if (row.effectiveFrom > input.at) {
      return false;
    }
    if (row.effectiveTo && row.effectiveTo <= input.at) {
      return false;
    }
    return true;
  });
  const modelHit = input.model ? active.filter((row) => row.model === input.model) : [];
  if (modelHit.length) {
    return pickLatest(modelHit);
  }
  const generic = active.filter((row) => !row.model);
  return pickLatest(generic);
}

export function computeCost(input: {
  provider: string;
  units: Prisma.Decimal | null;
  unitType: string | null;
  price: PriceRow | null;
  actualCost?: Prisma.Decimal | null;
  actualCurrency?: string | null;
  waived?: boolean;
}): CostComputation {
  if (input.waived || isMockProvider(input.provider)) {
    return {
      status: 'WAIVED',
      currency: input.actualCurrency ?? input.price?.currency ?? null,
      estimatedCost: new Prisma.Decimal(0),
      actualCost: new Prisma.Decimal(0),
      billableCost: new Prisma.Decimal(0),
      priceCatalogId: input.price?.id ?? null,
      calculationVersion: COST_CALCULATION_VERSION,
    };
  }
  if (input.actualCost != null) {
    return {
      status: 'FINAL',
      currency: input.actualCurrency ?? input.price?.currency ?? null,
      estimatedCost: input.price && input.units ? applyPrice(input.units, input.price) : null,
      actualCost: input.actualCost,
      billableCost: input.actualCost,
      priceCatalogId: input.price?.id ?? null,
      calculationVersion: COST_CALCULATION_VERSION,
    };
  }
  if (!input.price || input.units == null || !input.unitType) {
    return {
      status: 'UNPRICED',
      currency: null,
      estimatedCost: null,
      actualCost: null,
      billableCost: null,
      priceCatalogId: null,
      calculationVersion: COST_CALCULATION_VERSION,
    };
  }
  const estimated = applyPrice(input.units, input.price);
  return {
    status: 'ESTIMATED',
    currency: input.price.currency,
    estimatedCost: estimated,
    actualCost: null,
    billableCost: estimated,
    priceCatalogId: input.price.id,
    calculationVersion: COST_CALCULATION_VERSION,
  };
}

export function aggregateTotalsByCurrency(
  rows: Array<{ currency: string | null; amount: Prisma.Decimal | null }>,
): { totalsByCurrency: Array<{ currency: string; totalKnownCost: string }>; mixedCurrency: boolean } {
  const map = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (!row.currency || row.amount == null) {
      continue;
    }
    map.set(row.currency, (map.get(row.currency) ?? new Prisma.Decimal(0)).plus(row.amount));
  }
  const totalsByCurrency = [...map.entries()].map(([currency, totalKnownCost]) => ({
    currency,
    totalKnownCost: totalKnownCost.toFixed(6),
  }));
  return { totalsByCurrency, mixedCurrency: totalsByCurrency.length > 1 };
}

function applyPrice(units: Prisma.Decimal, price: PriceRow): Prisma.Decimal {
  const scale = price.unitScale.eq(0) ? new Prisma.Decimal(1) : price.unitScale;
  const raw = units.div(scale).mul(price.pricePerUnit);
  const roundCeil = Prisma.Decimal.ROUND_CEIL ?? 2;
  const roundFloor = Prisma.Decimal.ROUND_FLOOR ?? 3;
  if (price.roundingMode === 'CEIL') {
    return new Prisma.Decimal(raw.toFixed(6, roundCeil));
  }
  if (price.roundingMode === 'FLOOR') {
    return new Prisma.Decimal(raw.toFixed(6, roundFloor));
  }
  return new Prisma.Decimal(raw.toFixed(6));
}

function pickLatest(rows: PriceRow[]): PriceRow | null {
  if (!rows.length) {
    return null;
  }
  return [...rows].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

export function toDecimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  return new Prisma.Decimal(String(value));
}
