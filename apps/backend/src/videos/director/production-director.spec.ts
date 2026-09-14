import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  isCapabilityAvailable,
  materialSourceAvailable,
  modeHasExecutablePath,
} from './production-capability.registry.js';
import {
  buildFallbackDirectorPlan,
  rankAssetCandidates,
  validateDirectorOutput,
} from './production-director.helpers.js';
import type { AssetCandidateView } from './production-director.types.js';
import type { ScriptOutput } from '../../agents/definitions/script-generation.types.js';

const baseScript: ScriptOutput = {
  title: '测试脚本',
  hook: '你还在为客源发愁吗',
  opening: '今天分享三个方法',
  sections: [
    {
      sequence: 1,
      narration: '第一点先找准定位',
      visualSuggestion: '口播特写',
      subtitle: '找准定位',
      duration: 8,
    },
    {
      sequence: 2,
      narration: '第二点做出差异',
      visualSuggestion: '产品对比',
      subtitle: '做出差异',
      duration: 10,
    },
  ],
  ending: '记住关键是坚持',
  cta: '私信我领取清单',
  totalDuration: 30,
  estimatedWordCount: 120,
  voiceStyle: '专业',
  visualStyle: '竖屏口播',
  productionNotes: ['注意字幕'],
};

function candidate(partial: Partial<AssetCandidateView> & { assetId: string }): AssetCandidateView {
  return {
    mediaType: 'IMAGE',
    sourceLabel: '用户素材',
    sourceType: 'USER_UPLOAD',
    duration: null,
    orientation: 'portrait',
    usageSummary: '使用 0 次',
    usedCount: 0,
    lastUsedAt: null,
    referenceOnly: false,
    reusable: true,
    rightsStatus: 'OWNED',
    ...partial,
  };
}

describe('production director foundation', () => {
  it('builds READY fallback plan without providers', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [],
    });
    assert.equal(plan.status, 'READY');
    assert.ok(plan.shots.length >= 1);
    assert.ok(plan.shots.length <= 30);
    assert.equal(plan.shots[0]?.sequence, 1);
    assert.equal(plan.voiceStrategy, 'SYSTEM_VOICE');
    const v = validateDirectorOutput(plan, new Set());
    assert.equal(v.ok, true);
  });

  it('rejects invalid shot sequence and unknown asset', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [candidate({ assetId: 'a1' })],
    });
    plan.shots[0]!.sequence = 9;
    plan.shots[0]!.selectedAssetId = 'not-allowed';
    const v = validateDirectorOutput(plan, new Set(['a1']));
    assert.equal(v.ok, false);
  });

  it('never treats digital human / ai video as currently available', () => {
    assert.equal(isCapabilityAvailable('DIGITAL_HUMAN'), false);
    assert.equal(isCapabilityAvailable('AI_VIDEO'), false);
    assert.equal(materialSourceAvailable('DIGITAL_HUMAN'), false);
    assert.equal(modeHasExecutablePath('DIGITAL_HUMAN_BROLL').feasible, false);
  });

  it('ranks eligible user assets above overused ones and excludes reference-only via candidate builder assumptions', () => {
    const ranked = rankAssetCandidates(
      [
        candidate({ assetId: 'overused', usedCount: 20, lastUsedAt: new Date().toISOString() }),
        candidate({ assetId: 'fresh', usedCount: 0, sourceLabel: '用户素材', sourceType: 'USER_UPLOAD' }),
        candidate({
          assetId: 'generated',
          usedCount: 1,
          sourceLabel: '已生成可复用',
          sourceType: 'SYSTEM_GENERATED',
        }),
      ],
      { preferReal: true, preferPortrait: true },
    );
    assert.equal(ranked[0]?.assetId, 'fresh');
  });

  it('keeps shooting guidance optional and non-blocking', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [],
      preferences: { preferRealFootage: true },
    });
    for (const shot of plan.shots) {
      if (shot.shootingGuidance) {
        assert.equal(shot.shootingGuidance.optional, true);
      }
      const executable = [shot.preferredSource, ...shot.fallbackSources].some((s) =>
        materialSourceAvailable(s),
      );
      assert.equal(executable, true);
    }
  });

  it('prefers digital human preference but falls back when unavailable', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [],
      preferences: { preferDigitalHuman: true },
    });
    assert.notEqual(plan.mode, 'DIGITAL_HUMAN_BROLL');
    assert.ok(plan.productionWarnings.some((w) => w.code === 'DIGITAL_HUMAN_UNAVAILABLE'));
    assert.equal(plan.status, 'READY');
  });

  it('asset-rich path can select library assets', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [
        candidate({ assetId: 'img1', mediaType: 'IMAGE' }),
        candidate({ assetId: 'img2', mediaType: 'IMAGE' }),
      ],
    });
    assert.ok(['HYBRID', 'REAL_FOOTAGE', 'VOICEOVER_ASSETS', 'AI_ASSISTED'].includes(plan.mode));
    assert.ok(plan.shots.some((s) => s.selectedAssetId === 'img1' || s.preferredCandidateIds?.includes('img1')));
  });

  it('alternates IMAGE and VIDEO when both library types exist', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      candidates: [
        candidate({ assetId: 'img1', mediaType: 'IMAGE' }),
        candidate({ assetId: 'vid1', mediaType: 'VIDEO' }),
      ],
    });
    const types = new Set(
      plan.shots.map((s) => s.selectedAssetId).map((id) => (id === 'img1' ? 'IMAGE' : id === 'vid1' ? 'VIDEO' : id)),
    );
    assert.equal(types.has('IMAGE'), true);
    assert.equal(types.has('VIDEO'), true);
  });

  it('uses locked preferred mapping instead of naive image/video alternate', () => {
    const plan = buildFallbackDirectorPlan({
      scriptId: 's1',
      scriptVersion: 1,
      videoId: 'v1',
      payload: baseScript,
      preferredAssetIds: ['vid1', 'img1', 'img2'],
      candidates: [
        candidate({ assetId: 'vid1', mediaType: 'VIDEO' }),
        candidate({ assetId: 'img1', mediaType: 'IMAGE' }),
        candidate({ assetId: 'img2', mediaType: 'IMAGE' }),
      ],
    });
    assert.equal(plan.shots[0]?.selectedAssetId, 'vid1');
    assert.equal(plan.shots.every((s) => s.originalAudio === 'mute'), true);
  });
});
