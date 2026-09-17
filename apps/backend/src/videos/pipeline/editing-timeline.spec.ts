import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildEditingTimeline,
  buildTimelineFromLegacyProductionPlan,
  reconcileDurations,
  repairVisualGaps,
  validateEditingTimeline,
  type VisualTimelineItem,
} from './editing-timeline.js';
import type { MaterialResolutionSnapshot } from './material-resolve.types.js';
import type { VideoProductionPlan } from './production-plan.types.js';

const plan: VideoProductionPlan = {
  version: 1,
  scriptId: 's',
  videoId: 'v',
  scriptVersion: 1,
  generationVersion: 'g1',
  aspectRatio: '9:16',
  resolution: '1080x1920',
  fps: 30,
  targetDuration: 10,
  voice: { style: 'default', language: 'zh-CN', speed: 1, text: '旁白' },
  scenes: [
    {
      sceneId: 'a',
      sourceSectionSequence: 1,
      sourceKind: 'hook',
      sequence: 1,
      narration: 'n',
      subtitle: 's',
      visualSuggestion: 'x',
      visualIntent: 'n',
      requiredEvidence: 'x',
      visualPrompt: 'p',
      visualSourceType: 'USER_ASSET',
      durationBudget: 2,
      transition: 'cut',
    },
    {
      sceneId: 'b',
      sourceSectionSequence: 2,
      sourceKind: 'section',
      sequence: 2,
      narration: 'n',
      subtitle: 's',
      visualSuggestion: 'x',
      visualIntent: 'n',
      requiredEvidence: 'x',
      visualPrompt: 'p',
      visualSourceType: 'USER_ASSET',
      durationBudget: 8,
      transition: 'cut',
    },
  ],
  audio: { backgroundMusic: 'none', volume: 0.1 },
  subtitle: { style: 'default', position: 'bottom', format: 'srt' },
  output: { format: 'mp4', codec: 'h264' },
};

function materials(kindA: 'IMAGE' | 'VIDEO', kindB: 'IMAGE' | 'VIDEO'): MaterialResolutionSnapshot {
  return {
    version: 1,
    generationVersion: 'g1',
    materialHash: 'h',
    reusedAssetCount: 2,
    generatedShotCount: 0,
    shots: [
      {
        sequence: 1,
        shotPurpose: 'HOOK',
        requestedDurationMs: 2000,
        sourceKind: 'EXISTING_ASSET',
        assetId: 'a1',
        assetType: kindA,
        generationRequired: false,
        fallbackLevel: 0,
        originalAudioMode: 'MUTE',
        voiceoverRequired: true,
        subtitleRequired: true,
        fitMode: 'COVER',
        resolutionWarnings: [],
        sourceStartMs: kindA === 'VIDEO' ? 0 : undefined,
        sourceEndMs: kindA === 'VIDEO' ? 2000 : undefined,
      },
      {
        sequence: 2,
        shotPurpose: 'OTHER',
        requestedDurationMs: 8000,
        sourceKind: 'EXISTING_ASSET',
        assetId: 'a2',
        assetType: kindB,
        generationRequired: false,
        fallbackLevel: 0,
        originalAudioMode: 'MUTE',
        voiceoverRequired: true,
        subtitleRequired: true,
        fitMode: 'COVER',
        resolutionWarnings: [],
      },
    ],
  };
}

describe('editing timeline', () => {
  it('covers mixed image/video without gaps', () => {
    const timeline = buildEditingTimeline({
      videoId: 'v',
      generationVersion: 'g1',
      plan,
      materials: materials('IMAGE', 'VIDEO'),
      voiceDurationSec: 10,
      voiceAssetId: 'voice',
      subtitleAssetId: 'sub',
    });
    assert.equal(timeline.tracks.visual.length, 2);
    assert.equal(timeline.tracks.visual[0]?.assetType, 'IMAGE');
    assert.equal(timeline.tracks.visual[1]?.assetType, 'VIDEO');
    assert.equal(timeline.durationMs, 10000);
    assert.equal(timeline.tracks.visual[0]?.startMs, 0);
    assert.equal(timeline.tracks.visual.at(-1)?.endMs, 10000);
    assert.equal(validateEditingTimeline(timeline).length, 0);
  });

  it('scales shots to longer voice and keeps hook minimum', () => {
    const scaled = reconcileDurations(materials('IMAGE', 'IMAGE').shots, 60000);
    assert.equal(scaled.reduce((a, b) => a + b, 0), 60000);
    assert.ok((scaled[0] ?? 0) >= 800);
  });

  it('repairs visual gaps', () => {
    const items: VisualTimelineItem[] = [
      {
        sequence: 1,
        startMs: 0,
        endMs: 1000,
        assetType: 'IMAGE',
        fitMode: 'COVER',
        sourceKindLabel: '图片',
      },
      {
        sequence: 2,
        startMs: 4000,
        endMs: 5000,
        assetType: 'IMAGE',
        fitMode: 'COVER',
        sourceKindLabel: '图片',
      },
    ];
    repairVisualGaps(items, 5000);
    assert.equal(items[0]?.endMs, 4000);
    assert.equal(items[1]?.endMs, 5000);
  });

  it('rejects reference assets and out-of-range source', () => {
    const timeline = buildEditingTimeline({
      videoId: 'v',
      generationVersion: 'g1',
      plan,
      materials: materials('VIDEO', 'IMAGE'),
      voiceDurationSec: 10,
      voiceAssetId: 'voice',
    });
    const issues = validateEditingTimeline(timeline, [
      { id: 'a1', tenantId: 't', referenceOnly: true, duration: 1 },
      { id: 'a2', tenantId: 't' },
    ], 't');
    assert.ok(issues.includes('REFERENCE_ASSET') || issues.includes('INVALID_SOURCE_RANGE'));
  });

  it('bridges legacy production plan', () => {
    const timeline = buildTimelineFromLegacyProductionPlan({
      plan,
      visualAssetIds: ['x', 'y'],
      visualTypes: ['IMAGE', 'IMAGE'],
      voiceDurationSec: 12,
      voiceAssetId: 'voice',
      subtitleAssetId: 'sub',
    });
    assert.equal(timeline.tracks.visual.length, 2);
    assert.equal(timeline.durationMs, 12000);
    assert.equal(timeline.tracks.voice[0]?.assetId, 'voice');
  });

  it('is idempotent for same inputs', () => {
    const a = buildEditingTimeline({
      videoId: 'v',
      generationVersion: 'g1',
      plan,
      materials: materials('IMAGE', 'VIDEO'),
      voiceDurationSec: 10,
      voiceAssetId: 'voice',
      subtitleAssetId: 'sub',
    });
    const b = buildEditingTimeline({
      videoId: 'v',
      generationVersion: 'g1',
      plan,
      materials: materials('IMAGE', 'VIDEO'),
      voiceDurationSec: 10,
      voiceAssetId: 'voice',
      subtitleAssetId: 'sub',
    });
    assert.equal(a.timelineHash, b.timelineHash);
  });
});
