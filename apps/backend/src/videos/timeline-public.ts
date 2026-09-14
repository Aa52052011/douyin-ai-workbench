import { AssetStatus, PrismaClient } from '@prisma/client';
import { isCapabilityAvailable } from './director/production-capability.registry.js';
import type { ProductionDirectorOutput } from './director/production-director.types.js';
import { buildEditingTimeline, sourceKindLabel, type EditingTimelineV1 } from './pipeline/editing-timeline.js';
import { resolveShotMaterials, shotsFromScenes, toMaterialSnapshot } from './pipeline/material-resolve.js';
import { materialWarningLabels } from './pipeline/material-resolve.js';
import type { MaterialResolutionSnapshot, ResolverAsset } from './pipeline/material-resolve.types.js';
import type { VideoProductionPlan } from './pipeline/production-plan.types.js';

export type TimelinePublicView = {
  status: 'READY';
  reusedAssetCount: number;
  generatedShotCount: number;
  existingShotCount: number;
  durationLabel: string;
  warnings: string[];
  shots: Array<{
    sequence: number;
    timeLabel: string;
    sourceLabel: string;
    mediaLabel: string;
  }>;
  summary: string;
};

export function toTimelinePublicView(timeline: EditingTimelineV1, materials?: MaterialResolutionSnapshot): TimelinePublicView {
  const warnings = materialWarningLabels([
    ...new Set((materials?.shots ?? []).flatMap((shot) => shot.resolutionWarnings)),
  ]);
  return {
    status: 'READY',
    reusedAssetCount: timeline.metadata.reusedAssetCount,
    generatedShotCount: timeline.metadata.generatedShotCount,
    existingShotCount: timeline.metadata.reusedAssetCount,
    durationLabel: `${Math.round(timeline.durationMs / 1000)} 秒`,
    warnings,
    shots: timeline.tracks.visual.map((item) => ({
      sequence: item.sequence,
      timeLabel: `${formatSec(item.startMs)}–${formatSec(item.endMs)}`,
      sourceLabel: item.sourceKindLabel,
      mediaLabel: item.assetType === 'VIDEO' || item.assetType === 'SOURCE_VIDEO' || item.assetType === 'BROLL' ? '视频片段' : '图片',
    })),
    summary: `素材解析完成。使用了 ${timeline.metadata.reusedAssetCount} 个已有素材，AI 补充 ${timeline.metadata.generatedShotCount} 个镜头。`,
  };
}

export async function ensureTimelineSnapshot(input: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  plan: VideoProductionPlan;
  directorPlan?: ProductionDirectorOutput | null;
  directorHash?: string;
  preferredAssetIds?: string[];
}): Promise<{ materials: MaterialResolutionSnapshot; timeline: EditingTimelineV1 }> {
  const rows = await input.prisma.asset.findMany({
    where: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      deletedAt: null,
      status: AssetStatus.READY,
    },
    take: 80,
    orderBy: [{ usedCount: 'asc' }, { createdAt: 'desc' }],
  });
  const candidates: ResolverAsset[] = rows.map((row) => ({
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
  const directorShots = new Map(
    (input.directorPlan?.shots ?? []).map((shot) => [
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
      },
    ]),
  );
  const shots = input.plan.scenes.map(
    (scene) => directorShots.get(scene.sequence) ?? shotsFromScenes([scene])[0]!,
  );
  const resolved = resolveShotMaterials({
    shots,
    candidates,
    preferredAssetIds: input.preferredAssetIds,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    capabilities: {
      aiImage: isCapabilityAvailable('AI_IMAGE'),
      aiVideo: isCapabilityAvailable('AI_VIDEO'),
      digitalHuman: isCapabilityAvailable('DIGITAL_HUMAN'),
    },
  });
  const materials = toMaterialSnapshot(resolved, input.plan.generationVersion, input.directorHash);
  const timeline = buildEditingTimeline({
    videoId: input.plan.videoId,
    generationVersion: input.plan.generationVersion,
    plan: input.plan,
    materials,
    voiceDurationSec: input.plan.targetDuration,
  });
  void sourceKindLabel;
  return { materials, timeline };
}

function formatSec(ms: number): string {
  const sec = Math.round(ms / 100) / 10;
  return Number.isInteger(sec) ? String(sec) : sec.toFixed(1);
}
