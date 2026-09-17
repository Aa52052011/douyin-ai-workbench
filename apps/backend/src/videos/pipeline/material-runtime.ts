import { AssetStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { isCapabilityAvailable } from '../director/production-capability.registry.js';
import { resolveShotMaterials, shotsFromScenes, toMaterialSnapshot } from './material-resolve.js';
import type { MaterialResolutionSnapshot, ResolverAsset, ResolverShotInput } from './material-resolve.types.js';
import type { StageContext } from './stage-context.js';
import type { ProductionDirectorOutput } from '../director/production-director.types.js';

export async function resolveMaterialsForJob(ctx: StageContext): Promise<MaterialResolutionSnapshot> {
  const existing = readSnapshot(ctx);
  const directorHash = readDirectorHash(ctx);
  if (existing && existing.generationVersion === ctx.generationVersion && existing.directorPlanHash === directorHash) {
    if (await snapshotStillValid(ctx, existing)) {
      return existing;
    }
  }
  const excluded = readExcludedAssetIds(ctx);
  const preferred = readPreferredAssetIds(ctx);
  const lockPreferred = readLockPreferred(ctx);
  let candidates = (await loadCandidates(ctx)).filter((item) => !excluded.includes(item.id));
  if (lockPreferred && preferred.length) {
    candidates = candidates.filter((item) => preferred.includes(item.id));
  }
  const shots = readShots(ctx);
  const storageExists = async (key: string) => ctx.storage.exists(key);
  const existsCache = new Map<string, boolean>();
  const allowAiImage = readAllowAiImage(ctx);
  const resolved = resolveShotMaterials({
    shots,
    candidates,
    preferredAssetIds: preferred.filter((id) => !excluded.includes(id)),
    tenantId: ctx.job.tenantId,
    workspaceId: ctx.job.workspaceId,
    projectId: ctx.job.projectId,
    capabilities: {
      aiImage: allowAiImage && isCapabilityAvailable('AI_IMAGE'),
      aiVideo: isCapabilityAvailable('AI_VIDEO'),
      digitalHuman: isCapabilityAvailable('DIGITAL_HUMAN'),
    },
    storageExists: (key) => {
      const hit = existsCache.get(key);
      if (hit != null) {
        return hit;
      }
      existsCache.set(key, true);
      void storageExists(key).then((value) => existsCache.set(key, value));
      return true;
    },
  });
  for (const shot of resolved) {
    if (!shot.assetId) {
      continue;
    }
    const asset = candidates.find((item) => item.id === shot.assetId);
    if (asset && !(await ctx.storage.exists(asset.storageKey))) {
      shot.assetId = undefined;
      if (allowAiImage && isCapabilityAvailable('AI_IMAGE')) {
        shot.sourceKind = 'AI_IMAGE';
        shot.generationRequired = true;
        shot.generationType = 'AI_IMAGE';
        shot.fallbackLevel = 4;
        shot.resolutionWarnings = [...shot.resolutionWarnings, 'STORAGE_MISSING', 'FALLBACK_TO_AI_IMAGE'];
      } else {
        shot.sourceKind = 'PLACEHOLDER_FALLBACK';
        shot.generationRequired = true;
        shot.generationType = 'AI_IMAGE';
        shot.fallbackLevel = 4;
        shot.resolutionWarnings = [...shot.resolutionWarnings, 'STORAGE_MISSING', 'NO_MATCHING_ASSET'];
      }
    }
  }
  for (const shot of resolved) {
    if (shot.assetId && excluded.includes(shot.assetId)) {
      throw new AppError(ErrorCode.VIDEO_PLAN_INVALID, 'Forbidden asset selected');
    }
    if (shot.generationRequired && !allowAiImage) {
      throw new AppError(ErrorCode.VIDEO_PLAN_INVALID, 'AI image generation is disabled for this job');
    }
  }
  return toMaterialSnapshot(resolved, ctx.generationVersion, directorHash);
}

function readSnapshot(ctx: StageContext): MaterialResolutionSnapshot | undefined {
  const output = ctx.job.output;
  if (output && typeof output === 'object' && 'materialResolution' in output) {
    return (output as { materialResolution?: MaterialResolutionSnapshot }).materialResolution;
  }
  return undefined;
}

function readDirectorHash(ctx: StageContext): string | undefined {
  const input = ctx.job.input;
  if (input && typeof input === 'object' && 'directorContextHash' in input) {
    const value = (input as { directorContextHash?: unknown }).directorContextHash;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function readShots(ctx: StageContext): ResolverShotInput[] {
  const input = ctx.job.input;
  const director =
    input && typeof input === 'object' && 'directorPlan' in input
      ? ((input as { directorPlan?: ProductionDirectorOutput }).directorPlan ?? null)
      : null;
  const fromDirector = new Map(
    (director?.shots ?? []).map((shot) => [
      shot.sequence,
      {
        sequence: shot.sequence,
        shotPurpose: shot.purpose,
        requestedDurationMs: shot.durationMs,
        selectedAssetId: shot.selectedAssetId,
        preferredCandidateIds: shot.preferredCandidateIds,
        originalAudio: shot.originalAudio,
        voiceover: shot.voiceover,
        subtitle: shot.subtitle,
      } satisfies ResolverShotInput,
    ]),
  );
  return ctx.plan.scenes.map((scene) => fromDirector.get(scene.sequence) ?? shotsFromScenes([scene])[0]!);
}

function readPreferredAssetIds(ctx: StageContext): string[] {
  const input = ctx.job.input;
  if (!input || typeof input !== 'object') {
    return [];
  }
  const value = (input as { preferredAssetIds?: unknown }).preferredAssetIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readExcludedAssetIds(ctx: StageContext): string[] {
  const input = ctx.job.input;
  if (!input || typeof input !== 'object') {
    return [];
  }
  const value = (input as { excludedAssetIds?: unknown }).excludedAssetIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readLockPreferred(ctx: StageContext): boolean {
  const input = ctx.job.input;
  if (!input || typeof input !== 'object') {
    return false;
  }
  const prefs = (input as { preferences?: { lockPreferredAssets?: unknown } }).preferences;
  return prefs?.lockPreferredAssets === true;
}

function readAllowAiImage(ctx: StageContext): boolean {
  const input = ctx.job.input;
  if (!input || typeof input !== 'object') {
    return true;
  }
  const prefs = (input as { preferences?: { allowAiImage?: unknown } }).preferences;
  if (prefs && prefs.allowAiImage === false) {
    return false;
  }
  return true;
}

export async function reresolveAffectedShots(
  ctx: StageContext,
  sequences: number[],
  excludeAssetIds: string[],
): Promise<MaterialResolutionSnapshot> {
  const current = readSnapshot(ctx);
  const candidates = (await loadCandidates(ctx)).filter((item) => !excludeAssetIds.includes(item.id));
  const shots = readShots(ctx);
  const directorHash = readDirectorHash(ctx);
  const resolved = resolveShotMaterials({
    shots,
    candidates,
    preferredAssetIds: readPreferredAssetIds(ctx).filter((id) => !excludeAssetIds.includes(id)),
    tenantId: ctx.job.tenantId,
    workspaceId: ctx.job.workspaceId,
    projectId: ctx.job.projectId,
    capabilities: {
      aiImage: isCapabilityAvailable('AI_IMAGE'),
      aiVideo: isCapabilityAvailable('AI_VIDEO'),
      digitalHuman: isCapabilityAvailable('DIGITAL_HUMAN'),
    },
  });
  const merged = (current?.shots ?? resolved).map((shot) => {
    if (!sequences.includes(shot.sequence)) {
      return shot;
    }
    return resolved.find((item) => item.sequence === shot.sequence) ?? shot;
  });
  return toMaterialSnapshot(merged, ctx.generationVersion, directorHash);
}

async function loadCandidates(ctx: StageContext): Promise<ResolverAsset[]> {
  const rows = await ctx.prisma.asset.findMany({
    where: {
      tenantId: ctx.job.tenantId,
      workspaceId: ctx.job.workspaceId,
      projectId: ctx.job.projectId,
      deletedAt: null,
      status: AssetStatus.READY,
    },
    take: 80,
    orderBy: [{ usedCount: 'asc' }, { createdAt: 'desc' }],
  });
  return rows
    .filter((row) => {
      const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
      const videoId = typeof meta.videoId === 'string' ? meta.videoId : '';
      const stage = typeof meta.stage === 'string' ? meta.stage : '';
      if ((row.provider === 'wanx' || stage === 'visual') && videoId && videoId !== ctx.plan.videoId) {
        return false;
      }
      return true;
    })
    .map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    mimeType: row.mimeType,
    duration: row.duration,
    width: row.width,
    height: row.height,
    sourceType: row.sourceType,
    ownerType: row.ownerType,
    referenceOnly: row.referenceOnly,
    reusable: row.reusable,
    rightsStatus: row.rightsStatus,
    consentStatus: row.consentStatus,
    deletedAt: row.deletedAt,
    storageKey: row.storageKey,
    usedCount: row.usedCount,
    lastUsedAt: row.lastUsedAt,
    libraryVisible: row.libraryVisible,
  }));
}

async function snapshotStillValid(ctx: StageContext, snapshot: MaterialResolutionSnapshot): Promise<boolean> {
  for (const shot of snapshot.shots) {
    if (!shot.assetId || shot.generationRequired) {
      continue;
    }
    const row = await ctx.prisma.asset.findFirst({
      where: { id: shot.assetId, tenantId: ctx.job.tenantId, deletedAt: null },
    });
    if (!row || row.referenceOnly || row.status !== AssetStatus.READY) {
      return false;
    }
    if (!(await ctx.storage.exists(row.storageKey))) {
      return false;
    }
  }
  return true;
}
