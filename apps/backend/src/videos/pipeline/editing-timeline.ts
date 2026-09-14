import { createHash } from 'node:crypto';
import type { MaterialResolutionSnapshot, ResolvedShotMaterial } from './material-resolve.types.js';
import type { ProductionScene, VideoProductionPlan } from './production-plan.types.js';

export type TimelineFitMode = 'COVER' | 'CONTAIN';
export type OriginalAudioMode = 'MUTE' | 'PRESERVE' | 'DUCK';

export type VisualTimelineItem = {
  sequence: number;
  startMs: number;
  endMs: number;
  assetId?: string;
  assetType: string;
  sourceStartMs?: number;
  sourceEndMs?: number;
  freezePadMs?: number;
  fitMode: TimelineFitMode;
  sourceKindLabel: string;
  generationPending?: boolean;
};

export type AudioTimelineItem = {
  assetId?: string;
  startMs: number;
  endMs: number;
  volume: number;
  mode?: OriginalAudioMode;
};

export type SubtitleTimelineItem = {
  assetId?: string;
  timingMode: 'VOICE_ALIGNED';
  styleHint: string;
};

export type EditingTimelineV1 = {
  version: 1;
  videoId: string;
  generationVersion: string;
  durationMs: number;
  aspectRatio: string;
  width: number;
  height: number;
  fps: number;
  timelineHash: string;
  tracks: {
    visual: VisualTimelineItem[];
    voice: AudioTimelineItem[];
    originalAudio: AudioTimelineItem[];
    subtitle: SubtitleTimelineItem[];
    overlay: [];
  };
  metadata: {
    reusedAssetCount: number;
    generatedShotCount: number;
    materialHash: string;
    voiceAssetId?: string;
    subtitleAssetId?: string;
  };
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  EXISTING_ASSET: '已有素材',
  AI_IMAGE: 'AI 画面',
  AI_VIDEO: 'AI 视频',
  DIGITAL_HUMAN: '数字人',
  SYSTEM_LIBRARY: '系统素材',
  PLACEHOLDER_FALLBACK: '占位画面',
  IMAGE: '图片',
  VIDEO: '视频',
};

const MIN_HOOK_MS = 800;
const MIN_CTA_MS = 800;

export function hashEditingTimeline(input: {
  visual: Array<{ assetId?: string; startMs: number; endMs: number; sourceStartMs?: number; sourceEndMs?: number }>;
  voiceAssetId?: string;
  subtitleAssetId?: string;
  durationMs: number;
  originalAudio: OriginalAudioMode[];
  aspectRatio: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        visual: input.visual.map((item) => ({
          assetId: item.assetId ?? '',
          startMs: item.startMs,
          endMs: item.endMs,
          sourceStartMs: item.sourceStartMs ?? 0,
          sourceEndMs: item.sourceEndMs ?? 0,
        })),
        voiceAssetId: input.voiceAssetId ?? '',
        subtitleAssetId: input.subtitleAssetId ?? '',
        durationMs: input.durationMs,
        originalAudio: input.originalAudio,
        aspectRatio: input.aspectRatio,
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

export function reconcileDurations(
  shots: ResolvedShotMaterial[],
  voiceDurationMs: number,
): number[] {
  const target = Math.max(100, voiceDurationMs);
  const raw = shots.map((shot) => Math.max(100, shot.requestedDurationMs));
  const sum = raw.reduce((acc, item) => acc + item, 0);
  const scaled = raw.map((item) => Math.round((item / sum) * target));
  const purposes = shots.map((shot) => shot.shotPurpose);
  scaled.forEach((value, index) => {
    if (purposes[index] === 'HOOK') {
      scaled[index] = Math.max(MIN_HOOK_MS, value);
    }
    if (purposes[index] === 'CTA') {
      scaled[index] = Math.max(MIN_CTA_MS, value);
    }
  });
  const drift = target - scaled.reduce((acc, item) => acc + item, 0);
  let adjustable = scaled.length - 1;
  while (adjustable >= 0 && (purposes[adjustable] === 'HOOK' || purposes[adjustable] === 'CTA') && scaled.length > 1) {
    adjustable -= 1;
  }
  scaled[Math.max(0, adjustable)] = Math.max(100, (scaled[Math.max(0, adjustable)] ?? 0) + drift);
  return scaled;
}

export function buildEditingTimeline(input: {
  videoId: string;
  generationVersion: string;
  plan: VideoProductionPlan;
  materials: MaterialResolutionSnapshot;
  voiceDurationSec: number;
  voiceAssetId?: string;
  subtitleAssetId?: string;
}): EditingTimelineV1 {
  const durationMs = Math.max(100, Math.round(input.voiceDurationSec * 1000));
  const shotDurations = reconcileDurations(input.materials.shots, durationMs);
  let cursor = 0;
  const visual: VisualTimelineItem[] = input.materials.shots.map((shot, index) => {
    const span = shotDurations[index] ?? 100;
    const startMs = cursor;
    const endMs = cursor + span;
    cursor = endMs;
    return {
      sequence: shot.sequence,
      startMs,
      endMs,
      assetId: shot.assetId,
      assetType: shot.assetType ?? (shot.generationRequired ? 'IMAGE' : 'IMAGE'),
      sourceStartMs: shot.sourceStartMs,
      sourceEndMs: shot.sourceEndMs,
      freezePadMs: shot.freezePadMs,
      fitMode: shot.fitMode,
      sourceKindLabel: SOURCE_KIND_LABELS[shot.sourceKind] ?? '画面',
      generationPending: shot.generationRequired && !shot.assetId,
    };
  });
  repairVisualGaps(visual, durationMs);
  const originalAudio: AudioTimelineItem[] = input.materials.shots.flatMap((shot, index) => {
    if (shot.originalAudioMode === 'MUTE' || !isVideoType(shot.assetType)) {
      return [];
    }
    const item = visual[index];
    if (!item) {
      return [];
    }
    return [
      {
        assetId: shot.assetId,
        startMs: item.startMs,
        endMs: item.endMs,
        volume: shot.originalAudioMode === 'DUCK' ? 0.2 : 1,
        mode: shot.originalAudioMode,
      },
    ];
  });
  const timelineHash = hashEditingTimeline({
    visual,
    voiceAssetId: input.voiceAssetId,
    subtitleAssetId: input.subtitleAssetId,
    durationMs,
    originalAudio: input.materials.shots.map((shot) => shot.originalAudioMode),
    aspectRatio: input.plan.aspectRatio,
  });
  const [width, height] = parseWh(input.plan.resolution);
  return {
    version: 1,
    videoId: input.videoId,
    generationVersion: input.generationVersion,
    durationMs,
    aspectRatio: input.plan.aspectRatio,
    width,
    height,
    fps: input.plan.fps,
    timelineHash,
    tracks: {
      visual,
      voice: input.voiceAssetId
        ? [{ assetId: input.voiceAssetId, startMs: 0, endMs: durationMs, volume: 1 }]
        : [],
      originalAudio,
      subtitle: input.subtitleAssetId
        ? [{ assetId: input.subtitleAssetId, timingMode: 'VOICE_ALIGNED', styleHint: input.plan.subtitle.style }]
        : [],
      overlay: [],
    },
    metadata: {
      reusedAssetCount: input.materials.reusedAssetCount,
      generatedShotCount: input.materials.generatedShotCount,
      materialHash: input.materials.materialHash,
      voiceAssetId: input.voiceAssetId,
      subtitleAssetId: input.subtitleAssetId,
    },
  };
}

export function buildTimelineFromLegacyProductionPlan(input: {
  plan: VideoProductionPlan;
  visualAssetIds: string[];
  visualTypes?: string[];
  voiceDurationSec: number;
  voiceAssetId?: string;
  subtitleAssetId?: string;
}): EditingTimelineV1 {
  const shots: ResolvedShotMaterial[] = input.plan.scenes.map((scene, index) => ({
    sequence: scene.sequence,
    shotPurpose: scene.sourceKind === 'hook' ? 'HOOK' : scene.sourceKind === 'cta' ? 'CTA' : 'OTHER',
    requestedDurationMs: Math.max(100, Math.round(scene.durationBudget * 1000)),
    sourceKind: 'EXISTING_ASSET',
    assetId: input.visualAssetIds[index],
    assetType: input.visualTypes?.[index] ?? 'IMAGE',
    generationRequired: false,
    fallbackLevel: 0,
    originalAudioMode: 'MUTE',
    voiceoverRequired: true,
    subtitleRequired: true,
    fitMode: 'COVER',
    resolutionWarnings: [],
  }));
  return buildEditingTimeline({
    videoId: input.plan.videoId,
    generationVersion: input.plan.generationVersion,
    plan: input.plan,
    materials: {
      version: 1,
      generationVersion: input.plan.generationVersion,
      materialHash: 'legacy',
      reusedAssetCount: shots.filter((s) => s.assetId).length,
      generatedShotCount: 0,
      shots,
    },
    voiceDurationSec: input.voiceDurationSec,
    voiceAssetId: input.voiceAssetId,
    subtitleAssetId: input.subtitleAssetId,
  });
}

export type TimelineIssue =
  | 'NEGATIVE_TIME'
  | 'START_AFTER_END'
  | 'VISUAL_GAP'
  | 'INVALID_SOURCE_RANGE'
  | 'REFERENCE_ASSET'
  | 'MISSING_ASSET'
  | 'WRONG_TENANT'
  | 'DURATION_MISMATCH';

export function validateEditingTimeline(
  timeline: EditingTimelineV1,
  assets?: Array<{ id: string; tenantId: string; referenceOnly?: boolean; deletedAt?: Date | null; duration?: number | null }>,
  tenantId?: string,
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  if (timeline.durationMs <= 0) {
    issues.push('DURATION_MISMATCH');
  }
  let cursor = 0;
  for (const item of timeline.tracks.visual) {
    if (item.startMs < 0 || item.endMs < 0) {
      issues.push('NEGATIVE_TIME');
    }
    if (item.startMs >= item.endMs) {
      issues.push('START_AFTER_END');
    }
    if (item.startMs > cursor + 1) {
      issues.push('VISUAL_GAP');
    }
    cursor = Math.max(cursor, item.endMs);
    if (item.sourceStartMs != null && item.sourceEndMs != null) {
      if (item.sourceStartMs < 0 || item.sourceEndMs < item.sourceStartMs) {
        issues.push('INVALID_SOURCE_RANGE');
      }
    }
    const asset = assets?.find((row) => row.id === item.assetId);
    if (item.assetId && assets && !asset) {
      issues.push('MISSING_ASSET');
    }
    if (asset?.referenceOnly) {
      issues.push('REFERENCE_ASSET');
    }
    if (tenantId && asset && asset.tenantId !== tenantId) {
      issues.push('WRONG_TENANT');
    }
    if (asset?.duration != null && item.sourceEndMs != null && item.sourceEndMs > Math.round(asset.duration * 1000) + 1) {
      issues.push('INVALID_SOURCE_RANGE');
    }
  }
  if (timeline.tracks.visual.length && cursor + 1 < timeline.durationMs) {
    issues.push('VISUAL_GAP');
  }
  return [...new Set(issues)];
}

export function repairVisualGaps(visual: VisualTimelineItem[], durationMs: number): void {
  if (!visual.length) {
    return;
  }
  visual.sort((a, b) => a.sequence - b.sequence);
  visual[0]!.startMs = 0;
  for (let i = 1; i < visual.length; i++) {
    const prev = visual[i - 1]!;
    const cur = visual[i]!;
    if (cur.startMs > prev.endMs) {
      prev.endMs = cur.startMs;
    }
    if (cur.startMs < prev.endMs) {
      cur.startMs = prev.endMs;
    }
    if (cur.endMs <= cur.startMs) {
      cur.endMs = cur.startMs + 100;
    }
  }
  visual[visual.length - 1]!.endMs = durationMs;
}

export function sourceKindLabel(kind: string): string {
  return SOURCE_KIND_LABELS[kind] ?? '画面';
}

function isVideoType(type?: string): boolean {
  return type === 'VIDEO' || type === 'SOURCE_VIDEO' || type === 'BROLL';
}

function parseWh(resolution: string): [number, number] {
  const match = /^(\d+)x(\d+)$/.exec(resolution);
  return match ? [Number(match[1]), Number(match[2])] : [1080, 1920];
}

export function sceneToResolverHint(_scene: ProductionScene): void {
  /* reserved */
}
