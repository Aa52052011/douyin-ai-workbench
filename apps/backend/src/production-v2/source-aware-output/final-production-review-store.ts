import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { FinalProductionReviewV1 } from './final-production-review.js';

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class FileFinalProductionReviewStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  file(tenantId: string, reviewSessionId: string): string {
    return path.join(this.repoRoot, '.local', 'final-production-reviews', safe(tenantId), `${safe(reviewSessionId)}.json`);
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<FinalProductionReviewV1 | null> {
    const file = this.file(tenantId, reviewSessionId);
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as FinalProductionReviewV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  async putIfAbsentOrSame(review: FinalProductionReviewV1): Promise<FinalProductionReviewV1> {
    const existing = await this.getByReviewSession(review.tenantId, review.reviewSessionId);
    if (existing) {
      const same =
        existing.productionPlanId === review.productionPlanId &&
        JSON.stringify(existing.artifacts.map((item) => item.artifactId).sort()) ===
          JSON.stringify(review.artifacts.map((item) => item.artifactId).sort());
      if (!same) throw new Error('FINAL_REVIEW_IMMUTABLE');
      return existing;
    }
    const file = this.file(review.tenantId, review.reviewSessionId);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(review, null, 2)}\n`);
    return review;
  }

  async persistExplicitRequestChanges(review: FinalProductionReviewV1): Promise<FinalProductionReviewV1> {
    if (review.humanDecision !== 'REQUEST_CHANGES') throw new Error('ONLY_EXPLICIT_REQUEST_CHANGES');
    if (review.tenantId == null) throw new Error('TENANT_REQUIRED');
    const existing = await this.getByReviewSession(review.tenantId, review.reviewSessionId);
    if (!existing) throw new Error('FINAL_REVIEW_MISSING');
    if (existing.reviewId !== review.reviewId) throw new Error('FINAL_REVIEW_ID_MISMATCH');
    if (existing.humanDecision === 'ACCEPTED') throw new Error('CANNOT_OVERRIDE_ACCEPTED');
    const file = this.file(review.tenantId, review.reviewSessionId);
    writeFileSync(file, `${JSON.stringify(review, null, 2)}\n`);
    return review;
  }
}
