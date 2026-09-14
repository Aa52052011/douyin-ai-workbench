import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ProductionArtifactV1 } from './final-readiness.js';
import type { AuthorizationConsumptionV1, ProductionExecutionRunV1 } from './production-render.js';

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function productionArtifactRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-artifacts');
}

export function productionRunRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-execution-runs');
}

export function productionConsumptionRoot(repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()): string {
  return path.join(repoRoot, '.local', 'production-authorization-consumptions');
}

export function productionMediaFile(input: {
  tenantId: string;
  reviewSessionId: string;
  fileName: string;
  repoRoot?: string;
}): string {
  return path.join(productionArtifactRoot(input.repoRoot), safe(input.tenantId), safe(input.reviewSessionId), input.fileName);
}

export class FileProductionRunStore {
  constructor(private readonly repoRoot = process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()) {}

  runFile(run: Pick<ProductionExecutionRunV1, 'tenantId' | 'reviewSessionId' | 'profileId'>): string {
    const profile = safe(run.profileId.replaceAll(':', '.'));
    return path.join(productionRunRoot(this.repoRoot), safe(run.tenantId), safe(run.reviewSessionId), `${profile}.json`);
  }

  artifactMetaFile(input: { tenantId: string; reviewSessionId: string; profileId: string }): string {
    const profile = safe(input.profileId.replaceAll(':', '.'));
    return path.join(
      productionArtifactRoot(this.repoRoot),
      safe(input.tenantId),
      safe(input.reviewSessionId),
      `${profile}.json`,
    );
  }

  consumptionFile(tenantId: string, reviewSessionId: string): string {
    return path.join(productionConsumptionRoot(this.repoRoot), safe(tenantId), `${safe(reviewSessionId)}.json`);
  }

  async putRun(run: ProductionExecutionRunV1): Promise<ProductionExecutionRunV1> {
    const file = this.runFile(run);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
    return run;
  }

  async getRun(tenantId: string, reviewSessionId: string, profileId: string): Promise<ProductionExecutionRunV1 | null> {
    const file = this.runFile({ tenantId, reviewSessionId, profileId });
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProductionExecutionRunV1;
    if (parsed.tenantId !== tenantId) return null;
    return parsed;
  }

  async putArtifact(tenantId: string, reviewSessionId: string, artifact: ProductionArtifactV1): Promise<ProductionArtifactV1> {
    const file = this.artifactMetaFile({ tenantId, reviewSessionId, profileId: artifact.profileId });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
    return artifact;
  }

  async getArtifact(tenantId: string, reviewSessionId: string, profileId: string): Promise<ProductionArtifactV1 | null> {
    const file = this.artifactMetaFile({ tenantId, reviewSessionId, profileId });
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as ProductionArtifactV1;
  }

  async putConsumption(record: AuthorizationConsumptionV1): Promise<AuthorizationConsumptionV1> {
    const file = this.consumptionFile(record.tenantId, record.reviewSessionId);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }
}
