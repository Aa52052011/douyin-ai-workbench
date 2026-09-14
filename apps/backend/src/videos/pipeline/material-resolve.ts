import { createHash } from 'node:crypto';
import { isAssetProductionEligible } from '../../assets/asset-library.js';
import {
  MATERIAL_WARNING_LABELS,
  type MaterialCapabilities,
  type MaterialResolutionSnapshot,
  type MaterialWarningCode,
  type ResolvedShotMaterial,
  type ResolverAsset,
  type ResolverShotInput,
} from './material-resolve.types.js';

const VISUAL_TYPES = new Set(['IMAGE', 'VIDEO', 'SOURCE_VIDEO', 'BROLL', 'LOGO']);
const VIDEO_TYPES = new Set(['VIDEO', 'SOURCE_VIDEO', 'BROLL']);

export function isVisualMediaType(type: string): boolean {
  return VISUAL_TYPES.has(type);
}

export function isVideoMediaType(type: string): boolean {
  return VIDEO_TYPES.has(type);
}

export function hashMaterialResolution(shots: ResolvedShotMaterial[], generationVersion: string, directorPlanHash?: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        generationVersion,
        directorPlanHash: directorPlanHash ?? '',
        shots: shots.map((shot) => ({
          sequence: shot.sequence,
          sourceKind: shot.sourceKind,
          assetId: shot.assetId ?? '',
          generationType: shot.generationType ?? '',
          fallbackLevel: shot.fallbackLevel,
          sourceStartMs: shot.sourceStartMs ?? 0,
          sourceEndMs: shot.sourceEndMs ?? 0,
          originalAudioMode: shot.originalAudioMode,
        })),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

export function resolveShotMaterials(input: {
  shots: ResolverShotInput[];
  candidates: ResolverAsset[];
  preferredAssetIds?: string[];
  tenantId: string;
  workspaceId: string;
  projectId: string;
  capabilities: MaterialCapabilities;
  storageExists?: (storageKey: string) => boolean;
}): ResolvedShotMaterial[] {
  const usedRecently = new Map<string, number>();
  return input.shots.map((shot) =>
    resolveOneShot(shot, {
      ...input,
      usedRecently,
    }),
  );
}

export function toMaterialSnapshot(
  shots: ResolvedShotMaterial[],
  generationVersion: string,
  directorPlanHash?: string,
): MaterialResolutionSnapshot {
  return {
    version: 1,
    generationVersion,
    directorPlanHash,
    materialHash: hashMaterialResolution(shots, generationVersion, directorPlanHash),
    reusedAssetCount: shots.filter((s) => s.sourceKind === 'EXISTING_ASSET' && s.assetId).length,
    generatedShotCount: shots.filter((s) => s.generationRequired).length,
    shots,
  };
}

export function materialWarningLabels(codes: MaterialWarningCode[]): string[] {
  return codes.map((code) => MATERIAL_WARNING_LABELS[code]);
}

function resolveOneShot(
  shot: ResolverShotInput,
  ctx: {
    candidates: ResolverAsset[];
    preferredAssetIds?: string[];
    tenantId: string;
    workspaceId: string;
    projectId: string;
    capabilities: MaterialCapabilities;
    storageExists?: (storageKey: string) => boolean;
    usedRecently: Map<string, number>;
  },
): ResolvedShotMaterial {
  const warnings: MaterialWarningCode[] = [];
  const originalAudioMode: ResolvedShotMaterial['originalAudioMode'] =
    shot.originalAudio === 'preserve' ? 'PRESERVE' : shot.originalAudio === 'duck' ? 'DUCK' : 'MUTE';
  const base = {
    sequence: shot.sequence,
    shotPurpose: shot.shotPurpose,
    requestedDurationMs: shot.requestedDurationMs,
    originalAudioMode,
    voiceoverRequired: shot.voiceover !== false,
    subtitleRequired: shot.subtitle !== false,
    fitMode: 'COVER' as const,
  };

  const tryAsset = (asset: ResolverAsset | undefined, level: number, extra?: MaterialWarningCode[]): ResolvedShotMaterial | null => {
    if (!asset) {
      return null;
    }
    const blocked = inspectAsset(asset, ctx);
    if (blocked.hard) {
      warnings.push(...blocked.codes);
      return null;
    }
    warnings.push(...blocked.codes, ...(extra ?? []));
    if ((ctx.usedRecently.get(asset.id) ?? 0) >= 2) {
      warnings.push('REPEATED_ASSET');
    }
    ctx.usedRecently.set(asset.id, (ctx.usedRecently.get(asset.id) ?? 0) + 1);
    return withClipRange({
      ...base,
      sourceKind: 'EXISTING_ASSET',
      assetId: asset.id,
      assetType: asset.type,
      generationRequired: false,
      fallbackLevel: level,
      resolutionWarnings: unique(warnings),
    }, asset, ctx.usedRecently.get(asset.id) ?? 1);
  };

  const unusedPreferredExists = [...(shot.preferredCandidateIds ?? []), ...(ctx.preferredAssetIds ?? [])].some(
    (id) => id && (ctx.usedRecently.get(id) ?? 0) === 0 && ctx.candidates.some((item) => item.id === id),
  );
  const selected = shot.selectedAssetId ? ctx.candidates.find((item) => item.id === shot.selectedAssetId) : undefined;
  if (shot.selectedAssetId) {
    const alreadyUsed = (ctx.usedRecently.get(shot.selectedAssetId) ?? 0) >= 1;
    if (!(alreadyUsed && unusedPreferredExists)) {
      const hit = tryAsset(selected, 0);
      if (hit) {
        return hit;
      }
      warnings.push('SELECTED_ASSET_INVALID');
    }
  }

  const preferredOrdered = [...new Set([...(shot.preferredCandidateIds ?? []), ...(ctx.preferredAssetIds ?? [])])].sort(
    (a, b) => (ctx.usedRecently.get(a) ?? 0) - (ctx.usedRecently.get(b) ?? 0),
  );
  for (const id of preferredOrdered) {
    const hit = tryAsset(
      ctx.candidates.find((item) => item.id === id),
      1,
    );
    if (hit) {
      return hit;
    }
  }

  const ranked = rankCandidates(ctx.candidates, ctx, ctx.usedRecently);
  const libraryHit = tryAsset(ranked[0], 2);
  if (libraryHit) {
    return libraryHit;
  }

  if (!ctx.capabilities.aiVideo) {
    warnings.push('UNSUPPORTED_AI_VIDEO');
  }
  if (!ctx.capabilities.digitalHuman) {
    warnings.push('UNSUPPORTED_DIGITAL_HUMAN');
  }

  if (ctx.capabilities.aiImage) {
    warnings.push(ranked.length === 0 ? 'NO_MATCHING_ASSET' : 'FALLBACK_TO_AI_IMAGE');
    return {
      ...base,
      sourceKind: 'AI_IMAGE',
      generationRequired: true,
      generationType: 'AI_IMAGE',
      fallbackLevel: 4,
      resolutionWarnings: unique(warnings),
    };
  }

  warnings.push('NO_MATCHING_ASSET');
  return {
    ...base,
    sourceKind: 'PLACEHOLDER_FALLBACK',
    generationRequired: true,
    generationType: 'AI_IMAGE',
    fallbackLevel: 4,
    resolutionWarnings: unique(warnings),
  };
}

function inspectAsset(
  asset: ResolverAsset,
  ctx: {
    tenantId: string;
    workspaceId: string;
    projectId: string;
    storageExists?: (storageKey: string) => boolean;
  },
): { hard: boolean; codes: MaterialWarningCode[] } {
  const codes: MaterialWarningCode[] = [];
  if (asset.tenantId !== ctx.tenantId || asset.workspaceId !== ctx.workspaceId) {
    return { hard: true, codes: [] };
  }
  if (asset.projectId !== ctx.projectId && asset.ownerType !== 'SYSTEM' && asset.ownerType !== 'TENANT') {
    return { hard: true, codes: [] };
  }
  const eligibility = isAssetProductionEligible({
    asset: {
      tenantId: asset.tenantId,
      status: asset.status as never,
      deletedAt: asset.deletedAt,
      referenceOnly: asset.referenceOnly,
      reusable: asset.reusable,
      rightsStatus: asset.rightsStatus as never,
      consentStatus: asset.consentStatus as never,
      sourceType: asset.sourceType as never,
    },
    callerTenantId: ctx.tenantId,
  });
  if (eligibility.reasonCodes.includes('REFERENCE_ONLY')) {
    return { hard: true, codes: ['REFERENCE_ASSET_BLOCKED'] };
  }
  if (eligibility.reasonCodes.includes('DELETED') || eligibility.reasonCodes.includes('CONSENT_REVOKED') || eligibility.reasonCodes.includes('RIGHTS_RESTRICTED')) {
    return { hard: true, codes: ['SELECTED_ASSET_INVALID'] };
  }
  if (eligibility.reasonCodes.includes('NOT_READY')) {
    return { hard: true, codes: ['ASSET_NOT_READY'] };
  }
  if (!eligibility.eligible) {
    return { hard: true, codes: ['SELECTED_ASSET_INVALID'] };
  }
  if (!isVisualMediaType(asset.type)) {
    return { hard: true, codes: ['WRONG_MEDIA_TYPE'] };
  }
  if (ctx.storageExists && !ctx.storageExists(asset.storageKey)) {
    return { hard: true, codes: ['STORAGE_MISSING'] };
  }
  if (asset.width && asset.height && asset.width > asset.height) {
    codes.push('ORIENTATION_MISMATCH');
  }
  return { hard: false, codes };
}

function rankCandidates(
  candidates: ResolverAsset[],
  ctx: { tenantId: string; workspaceId: string; projectId: string; storageExists?: (storageKey: string) => boolean },
  usedRecently: Map<string, number>,
): ResolverAsset[] {
  return candidates
    .filter((asset) => !inspectAsset(asset, ctx).hard)
    .sort((a, b) => {
      const usedA = usedRecently.get(a.id) ?? 0;
      const usedB = usedRecently.get(b.id) ?? 0;
      if (usedA !== usedB) {
        return usedA - usedB;
      }
      if (a.usedCount !== b.usedCount) {
        return a.usedCount - b.usedCount;
      }
      return String(a.id).localeCompare(String(b.id));
    });
}

function withClipRange(shot: ResolvedShotMaterial, asset: ResolverAsset, useIndex: number): ResolvedShotMaterial {
  if (!isVideoMediaType(asset.type)) {
    return shot;
  }
  const sourceMs = Math.max(0, Math.round((asset.duration ?? 0) * 1000));
  const need = shot.requestedDurationMs;
  if (sourceMs <= 0) {
    return { ...shot, sourceStartMs: 0, sourceEndMs: 0, freezePadMs: need, resolutionWarnings: unique([...shot.resolutionWarnings, 'VIDEO_TOO_SHORT']) };
  }
  if (sourceMs >= need) {
    const stride = Math.max(need, 4000);
    const maxStart = sourceMs - need;
    const start = Math.min(maxStart, Math.max(0, useIndex - 1) * stride);
    return { ...shot, sourceStartMs: start, sourceEndMs: start + need };
  }
  return {
    ...shot,
    sourceStartMs: 0,
    sourceEndMs: sourceMs,
    freezePadMs: need - sourceMs,
    resolutionWarnings: unique([...shot.resolutionWarnings, 'VIDEO_TOO_SHORT']),
  };
}

function unique(codes: MaterialWarningCode[]): MaterialWarningCode[] {
  return [...new Set(codes)];
}

export function shotsFromScenes(
  scenes: Array<{ sequence: number; sourceKind: string; durationBudget: number }>,
): ResolverShotInput[] {
  return scenes.map((scene) => ({
    sequence: scene.sequence,
    shotPurpose: scene.sourceKind === 'hook' ? 'HOOK' : scene.sourceKind === 'cta' ? 'CTA' : 'OTHER',
    requestedDurationMs: Math.max(100, Math.round(scene.durationBudget * 1000)),
    originalAudio: 'mute',
    voiceover: true,
    subtitle: true,
  }));
}
