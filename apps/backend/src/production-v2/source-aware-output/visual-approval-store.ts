import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { HumanVisualApprovalV1 } from './visual-approval.js';

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function visualApprovalRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'human-visual-approvals');
}

export function visualApprovalFile(input: { tenantId: string; reviewSessionId: string; repoRoot?: string }): string {
  return path.join(visualApprovalRoot(input.repoRoot), safe(input.tenantId), `${safe(input.reviewSessionId)}.json`);
}

export class FileVisualApprovalStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<HumanVisualApprovalV1 | null> {
    const file = visualApprovalFile({ tenantId, reviewSessionId, repoRoot: this.repoRoot });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as HumanVisualApprovalV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  async putIfAbsentOrSameHash(approval: HumanVisualApprovalV1): Promise<HumanVisualApprovalV1> {
    const existing = await this.getByReviewSession(approval.tenantId, approval.reviewSessionId);
    if (existing) {
      if (existing.approvalBindingHash === approval.approvalBindingHash) return existing;
      throw new Error('APPROVAL_IMMUTABLE');
    }
    const file = visualApprovalFile({
      tenantId: approval.tenantId,
      reviewSessionId: approval.reviewSessionId,
      repoRoot: this.repoRoot,
    });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(approval, null, 2)}\n`);
    return approval;
  }
}

export class MemoryVisualApprovalStore {
  private readonly byKey = new Map<string, HumanVisualApprovalV1>();

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<HumanVisualApprovalV1 | null> {
    return this.byKey.get(`${tenantId}:${reviewSessionId}`) ?? null;
  }

  async putIfAbsentOrSameHash(approval: HumanVisualApprovalV1): Promise<HumanVisualApprovalV1> {
    const key = `${approval.tenantId}:${approval.reviewSessionId}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.approvalBindingHash === approval.approvalBindingHash) return existing;
      throw new Error('APPROVAL_IMMUTABLE');
    }
    this.byKey.set(key, approval);
    return approval;
  }
}
