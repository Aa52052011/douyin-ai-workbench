import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { OutputSelectionPersistenceV1 } from './dual-output.js';

export const OUTPUT_SELECTION_FILE_VERSION = 'output-selection.file-store:v1' as const;

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function outputSelectionRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'output-selections');
}

export function outputSelectionFile(input: { tenantId: string; reviewSessionId: string; repoRoot?: string }): string {
  return path.join(outputSelectionRoot(input.repoRoot), safe(input.tenantId), `${safe(input.reviewSessionId)}.json`);
}

export interface OutputSelectionStore {
  upsert(selection: OutputSelectionPersistenceV1): Promise<OutputSelectionPersistenceV1>;
  getByReviewSession(tenantId: string, reviewSessionId: string): Promise<OutputSelectionPersistenceV1 | null>;
}

export class MemoryOutputSelectionStore implements OutputSelectionStore {
  private readonly byKey = new Map<string, OutputSelectionPersistenceV1>();

  async upsert(selection: OutputSelectionPersistenceV1): Promise<OutputSelectionPersistenceV1> {
    const next = { ...selection, updatedAt: new Date().toISOString() };
    this.byKey.set(`${selection.tenantId}:${selection.reviewSessionId}`, next);
    this.byKey.set(`id:${selection.tenantId}:${selection.selectionId}`, next);
    return next;
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    return this.byKey.get(`${tenantId}:${reviewSessionId}`) ?? null;
  }

  async getBySelectionId(tenantId: string, selectionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    return this.byKey.get(`id:${tenantId}:${selectionId}`) ?? null;
  }
}

export class FileOutputSelectionStore implements OutputSelectionStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  async upsert(selection: OutputSelectionPersistenceV1): Promise<OutputSelectionPersistenceV1> {
    const next = { ...selection, updatedAt: new Date().toISOString() };
    const file = outputSelectionFile({
      tenantId: selection.tenantId,
      reviewSessionId: selection.reviewSessionId,
      repoRoot: this.repoRoot,
    });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    const file = outputSelectionFile({ tenantId, reviewSessionId, repoRoot: this.repoRoot });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as OutputSelectionPersistenceV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }
}

export class CompositeOutputSelectionStore implements OutputSelectionStore {
  constructor(private readonly stores: OutputSelectionStore[]) {}

  async upsert(selection: OutputSelectionPersistenceV1): Promise<OutputSelectionPersistenceV1> {
    let last = selection;
    for (const store of this.stores) {
      last = await store.upsert(selection);
    }
    return last;
  }

  async getByReviewSession(tenantId: string, reviewSessionId: string): Promise<OutputSelectionPersistenceV1 | null> {
    for (const store of this.stores) {
      const found = await store.getByReviewSession(tenantId, reviewSessionId);
      if (found && found.tenantId === tenantId) return found;
    }
    return null;
  }
}
