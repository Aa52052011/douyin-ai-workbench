import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ProductionAuthorizationV1 } from './visual-approval.js';
import type { ProductionExecutionPreparationV1 } from './final-readiness.js';

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function productionAuthorizationRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-authorizations');
}

export function productionAuthorizationFile(input: { tenantId: string; reviewSessionId: string; repoRoot?: string }): string {
  return path.join(productionAuthorizationRoot(input.repoRoot), safe(input.tenantId), `${safe(input.reviewSessionId)}.json`);
}

export function productionExecutionPreparationRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-execution-preparations');
}

export function productionExecutionPreparationFile(input: {
  tenantId: string;
  reviewSessionId: string;
  repoRoot?: string;
}): string {
  return path.join(
    productionExecutionPreparationRoot(input.repoRoot),
    safe(input.tenantId),
    `${safe(input.reviewSessionId)}.json`,
  );
}

export class FileProductionAuthorizationStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<ProductionAuthorizationV1 | null> {
    const file = productionAuthorizationFile({ tenantId, reviewSessionId, repoRoot: this.repoRoot });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProductionAuthorizationV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  async putIfAbsentOrSameHash(authorization: ProductionAuthorizationV1): Promise<ProductionAuthorizationV1> {
    const existing = await this.getByReviewSession(authorization.tenantId, authorization.reviewSessionId);
    if (existing) {
      if (existing.authorizationBindingHash === authorization.authorizationBindingHash) return existing;
      throw new Error('AUTHORIZATION_IMMUTABLE');
    }
    const file = productionAuthorizationFile({
      tenantId: authorization.tenantId,
      reviewSessionId: authorization.reviewSessionId,
      repoRoot: this.repoRoot,
    });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(authorization, null, 2)}\n`);
    return authorization;
  }
}

export class MemoryProductionAuthorizationStore {
  private readonly byKey = new Map<string, ProductionAuthorizationV1>();

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<ProductionAuthorizationV1 | null> {
    return this.byKey.get(`${tenantId}:${reviewSessionId}`) ?? null;
  }

  async putIfAbsentOrSameHash(authorization: ProductionAuthorizationV1): Promise<ProductionAuthorizationV1> {
    const key = `${authorization.tenantId}:${authorization.reviewSessionId}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.authorizationBindingHash === authorization.authorizationBindingHash) return existing;
      throw new Error('AUTHORIZATION_IMMUTABLE');
    }
    this.byKey.set(key, authorization);
    return authorization;
  }
}

export class FileProductionExecutionPreparationStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<ProductionExecutionPreparationV1 | null> {
    const file = productionExecutionPreparationFile({ tenantId, reviewSessionId, repoRoot: this.repoRoot });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProductionExecutionPreparationV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  async putIfAbsent(preparation: ProductionExecutionPreparationV1): Promise<ProductionExecutionPreparationV1> {
    const existing = await this.getByReviewSession(preparation.tenantId, preparation.reviewSessionId);
    if (existing) {
      if (
        existing.authorizationId === preparation.authorizationId &&
        existing.sourceAssetId === preparation.sourceAssetId &&
        JSON.stringify(existing.profiles) === JSON.stringify(preparation.profiles) &&
        JSON.stringify(existing.restrictedClaims) === JSON.stringify(preparation.restrictedClaims)
      ) {
        return existing;
      }
      throw new Error('EXECUTION_PREPARATION_IMMUTABLE');
    }
    const file = productionExecutionPreparationFile({
      tenantId: preparation.tenantId,
      reviewSessionId: preparation.reviewSessionId,
      repoRoot: this.repoRoot,
    });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(preparation, null, 2)}\n`);
    return preparation;
  }
}

export class MemoryProductionExecutionPreparationStore {
  private readonly byKey = new Map<string, ProductionExecutionPreparationV1>();

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<ProductionExecutionPreparationV1 | null> {
    return this.byKey.get(`${tenantId}:${reviewSessionId}`) ?? null;
  }

  async putIfAbsent(preparation: ProductionExecutionPreparationV1): Promise<ProductionExecutionPreparationV1> {
    const key = `${preparation.tenantId}:${preparation.reviewSessionId}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (
        existing.authorizationId === preparation.authorizationId &&
        existing.sourceAssetId === preparation.sourceAssetId &&
        JSON.stringify(existing.profiles) === JSON.stringify(preparation.profiles)
      ) {
        return existing;
      }
      throw new Error('EXECUTION_PREPARATION_IMMUTABLE');
    }
    this.byKey.set(key, preparation);
    return preparation;
  }
}
