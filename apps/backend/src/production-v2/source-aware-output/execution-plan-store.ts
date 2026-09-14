import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { DualProfileProductionExecutionPlanV1 } from './final-readiness.js';

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function executionPlanRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-execution-plans');
}

export function executionPlanFile(input: { tenantId: string; reviewSessionId: string; repoRoot?: string }): string {
  return path.join(executionPlanRoot(input.repoRoot), safe(input.tenantId), `${safe(input.reviewSessionId)}.json`);
}

export interface ExecutionPlanStore {
  upsert(plan: DualProfileProductionExecutionPlanV1): Promise<DualProfileProductionExecutionPlanV1>;
  getByReviewSession(tenantId: string, reviewSessionId: string): Promise<DualProfileProductionExecutionPlanV1 | null>;
}

export class MemoryExecutionPlanStore implements ExecutionPlanStore {
  private readonly byKey = new Map<string, DualProfileProductionExecutionPlanV1>();

  async upsert(plan: DualProfileProductionExecutionPlanV1): Promise<DualProfileProductionExecutionPlanV1> {
    this.byKey.set(`${plan.tenantId}:${plan.reviewSessionId}`, plan);
    return plan;
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<DualProfileProductionExecutionPlanV1 | null> {
    return this.byKey.get(`${tenantId}:${reviewSessionId}`) ?? null;
  }
}

export class FileExecutionPlanStore implements ExecutionPlanStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  async upsert(plan: DualProfileProductionExecutionPlanV1): Promise<DualProfileProductionExecutionPlanV1> {
    const file = executionPlanFile({ tenantId: plan.tenantId, reviewSessionId: plan.reviewSessionId, repoRoot: this.repoRoot });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
    return plan;
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<DualProfileProductionExecutionPlanV1 | null> {
    const file = executionPlanFile({ tenantId, reviewSessionId, repoRoot: this.repoRoot });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as DualProfileProductionExecutionPlanV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }
}
