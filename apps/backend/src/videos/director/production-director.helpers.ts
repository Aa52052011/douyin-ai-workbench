/**
 * Deterministic Production Director helpers (no LLM / no media providers).
 */
import { createHash } from 'node:crypto';
import type { ScriptOutput } from '../../agents/definitions/script-generation.types.js';
import { isAssetProductionEligible } from '../../assets/asset-library.js';
import type { Asset } from '@prisma/client';
import {
  CAPABILITY_REGISTRY_VERSION,
  defaultExecutableFallbackSources,
  materialSourceAvailable,
  modeHasExecutablePath,
} from './production-capability.registry.js';
import {
  DIRECTOR_LIMITS,
  MODE_LABELS,
  PURPOSE_LABELS,
  SOURCE_LABELS,
  WARNING_LABELS,
  type AssetCandidateView,
  type DirectorShot,
  type DirectorWarningCode,
  type MaterialSource,
  type ProductionDirectorOutput,
  type ProductionDirectorPublicView,
  type ProductionMode,
  type ProductionPreferences,
  type ShotPurpose,
  type VoiceStrategy,
} from './production-director.types.js';
import { resolveVoiceConfig } from '../../voice/voice-resolve.js';

export function computeDirectorContextHash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
}

export function orientationOf(asset: Pick<Asset, 'width' | 'height'>): AssetCandidateView['orientation'] {
  if (!asset.width || !asset.height) return 'unknown';
  if (asset.height > asset.width) return 'portrait';
  if (asset.width > asset.height) return 'landscape';
  return 'square';
}

export function toAssetCandidateView(
  asset: Asset,
  callerTenantId: string,
): AssetCandidateView | null {
  const eligible = isAssetProductionEligible({ asset, callerTenantId });
  if (!eligible.eligible) return null;
  if (asset.referenceOnly) return null;
  const sourceLabel =
    asset.sourceType === 'USER_UPLOAD' || asset.sourceType === 'PROJECT_UPLOAD'
      ? '用户素材'
      : asset.sourceType === 'SYSTEM_GENERATED' || asset.sourceType === 'PROVIDER_GENERATED'
        ? '已生成可复用'
        : asset.sourceType === 'SYSTEM_LIBRARY'
          ? '系统素材'
          : '项目素材';
  return {
    assetId: asset.id,
    mediaType: asset.type,
    sourceLabel,
    sourceType: asset.sourceType,
    duration: asset.duration,
    orientation: orientationOf(asset),
    usageSummary: `使用 ${asset.usedCount} 次`,
    usedCount: asset.usedCount,
    lastUsedAt: asset.lastUsedAt?.toISOString() ?? null,
    referenceOnly: asset.referenceOnly,
    reusable: asset.reusable,
    rightsStatus: asset.rightsStatus,
  };
}

export function rankAssetCandidates(
  candidates: AssetCandidateView[],
  prefs?: { preferPortrait?: boolean; preferReal?: boolean },
): AssetCandidateView[] {
  const scored = candidates.map((c) => {
    let score = 100;
    if (c.referenceOnly) score -= 1000;
    if (!c.reusable) score -= 50;
    if (c.rightsStatus === 'RESTRICTED' || c.rightsStatus === 'REFERENCE_ONLY') score -= 1000;
    if (prefs?.preferPortrait && c.orientation === 'portrait') score += 20;
    if (prefs?.preferPortrait && c.orientation === 'landscape') score -= 10;
    if (prefs?.preferReal) {
      if (c.sourceLabel.includes('用户') || c.sourceType?.includes('UPLOAD')) score += 30;
      if (c.sourceLabel.includes('生成')) score -= 5;
    }
    // repetition penalty
    score -= Math.min(40, c.usedCount * 4);
    if (c.lastUsedAt) {
      const ageMs = Date.now() - Date.parse(c.lastUsedAt);
      if (Number.isFinite(ageMs) && ageMs < 1000 * 60 * 60 * 24) score -= 15;
    }
    if (c.mediaType === 'IMAGE' || c.mediaType === 'VIDEO' || c.mediaType === 'BROLL') score += 5;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score || a.c.assetId.localeCompare(b.c.assetId));
  return scored.map((s) => s.c);
}

export function purposeForKind(kind: string, index: number, total: number): ShotPurpose {
  if (kind === 'hook') return 'HOOK';
  if (kind === 'cta') return 'CTA';
  if (kind === 'opening') return 'PROBLEM';
  if (kind === 'ending') return 'TRANSITION';
  if (index <= 1) return 'EXPLANATION';
  if (index >= total - 2) return 'PROOF';
  return 'EXPLANATION';
}

export function chooseMode(input: {
  preferences?: ProductionPreferences;
  hasEligibleRealAssets: boolean;
  hasEligibleDigitalHuman?: boolean;
  goalCode?: string;
}): { mode: ProductionMode; warnings: DirectorWarningCode[] } {
  const warnings: DirectorWarningCode[] = [];
  if (input.preferences?.preferDigitalHuman) {
    const dh = modeHasExecutablePath('DIGITAL_HUMAN_BROLL', {
      hasEligibleDigitalHuman: input.hasEligibleDigitalHuman === true,
    });
    if (!dh.feasible) {
      warnings.push('DIGITAL_HUMAN_UNAVAILABLE', 'PREFERRED_MODE_UNAVAILABLE');
    } else {
      return { mode: 'DIGITAL_HUMAN_BROLL', warnings };
    }
  }
  if (input.preferences?.preferRealFootage && input.hasEligibleRealAssets) {
    return { mode: 'REAL_FOOTAGE', warnings };
  }
  if (input.preferences?.preferRealFootage && !input.hasEligibleRealAssets) {
    warnings.push('NO_MATCHING_REAL_ASSET', 'PREFERRED_MODE_UNAVAILABLE');
  }
  if (input.hasEligibleRealAssets) {
    return { mode: 'HYBRID', warnings };
  }
  warnings.push('NO_MATCHING_REAL_ASSET');
  if (input.goalCode === 'BRAND_AWARENESS' || input.goalCode === 'SALES') {
    return { mode: 'AI_ASSISTED', warnings };
  }
  return { mode: 'VOICEOVER_ASSETS', warnings };
}

export function buildFallbackDirectorPlan(input: {
  scriptId: string;
  scriptVersion: number;
  videoId: string;
  payload: ScriptOutput;
  aspectRatio?: string;
  targetDuration?: number;
  preferences?: ProductionPreferences;
  candidates: AssetCandidateView[];
  preferredAssetIds?: string[];
  referencePatternIds?: string[];
  goalCode?: string;
  strategyId?: string;
  contentPlanId?: string;
  topicId?: string;
  memorySnapshotVersion?: number;
  contentPlanTitle?: string;
  eligibleDigitalHumanProfileIds?: string[];
}): ProductionDirectorOutput {
  const hasReal = input.candidates.some(
    (c) =>
      !c.referenceOnly &&
      (c.sourceType?.includes('UPLOAD') || c.sourceLabel.includes('用户') || c.sourceLabel.includes('历史')),
  );
  const ranked = rankAssetCandidates(input.candidates, {
    preferPortrait: true,
    preferReal: true,
  }).slice(0, DIRECTOR_LIMITS.maxAssetCandidates);

  const modePick = chooseMode({
    preferences: input.preferences,
    hasEligibleRealAssets: hasReal,
    hasEligibleDigitalHuman: (input.eligibleDigitalHumanProfileIds ?? []).length > 0,
    goalCode: input.goalCode,
  });
  let mode = modePick.mode;
  const warnings = [...modePick.warnings];
  const feasibility = modeHasExecutablePath(mode, { hasEligibleRealAssets: hasReal });
  if (!feasibility.feasible) {
    mode = hasReal ? 'HYBRID' : 'VOICEOVER_ASSETS';
    warnings.push('FALLBACK_DIRECTOR_USED');
  }

  const segments: Array<{
    kind: string;
    narration: string;
    visual: string;
    durationSec: number;
  }> = [];
  const push = (kind: string, narration: string, visual: string, durationSec: number) => {
    const text = narration.trim();
    if (!text) return;
    segments.push({ kind, narration: text, visual: visual.trim() || '画面服务于旁白重点', durationSec });
  };
  push('hook', input.payload.hook, input.payload.visualStyle, 2);
  push('opening', input.payload.opening, input.payload.visualStyle, 2);
  for (const section of [...input.payload.sections].sort((a, b) => a.sequence - b.sequence)) {
    push('section', section.narration, section.visualSuggestion, Math.max(1, section.duration));
  }
  push('ending', input.payload.ending, input.payload.visualStyle, 2);
  push('cta', input.payload.cta, input.payload.visualStyle, 2);

  const targetDuration = input.targetDuration ?? input.payload.totalDuration;
  const sumSec = segments.reduce((a, s) => a + s.durationSec, 0) || targetDuration;
  const scale = sumSec > 0 ? targetDuration / sumSec : 1;

  const fallbackSources = defaultExecutableFallbackSources(hasReal).filter(materialSourceAvailable);
  const preferredPrimary: MaterialSource = hasReal ? 'USER_LIBRARY' : 'AI_IMAGE';

  const shots: DirectorShot[] = segments.slice(0, DIRECTOR_LIMITS.maxShots).map((seg, index) => {
    const purpose = purposeForKind(seg.kind, index, segments.length);
    const preferredSource: MaterialSource =
      mode === 'AI_ASSISTED' && !hasReal
        ? 'AI_IMAGE'
        : mode === 'REAL_FOOTAGE'
          ? 'USER_LIBRARY'
          : preferredPrimary;
    const preferredCandidates = ranked
      .filter((c) => c.mediaType === 'IMAGE' || c.mediaType === 'VIDEO' || c.mediaType === 'BROLL')
      .slice(0, 3)
      .map((c) => c.assetId);
    const generativeSources: MaterialSource[] = ['AI_IMAGE', 'AI_VIDEO', 'DIGITAL_HUMAN'];
    const imageCandidate = ranked.find((c) => c.mediaType === 'IMAGE')?.assetId;
    const videoCandidate = ranked.find((c) => c.mediaType === 'VIDEO' || c.mediaType === 'BROLL')?.assetId;
    const mixedPreferred =
      imageCandidate && videoCandidate
        ? index % 2 === 0
          ? videoCandidate
          : imageCandidate
        : preferredCandidates[0];
    const lockedPick = pickPreferredShotAsset(index, seg.kind, input.preferredAssetIds, input.candidates);
    const selected = generativeSources.includes(preferredSource)
      ? undefined
      : (lockedPick ?? mixedPreferred);
    const durationMs = Math.max(1000, Math.round(seg.durationSec * scale * 1000));
    const shot: DirectorShot = {
      sequence: index + 1,
      purpose,
      durationMs,
      narrationSegment: seg.narration.slice(0, 500),
      visualRequirement: seg.visual.slice(0, 240),
      preferredSource,
      fallbackSources: fallbackSources.filter((s) => s !== preferredSource).slice(0, 5),
      preferredCandidateIds: preferredCandidates,
      selectedAssetId: selected,
      generationInstruction:
        preferredSource === 'AI_IMAGE' || !selected
          ? `竖屏画面：${seg.visual.slice(0, 120)}`
          : undefined,
      voiceover: true,
      subtitle: true,
      originalAudio: 'mute',
      transitionHint: 'cut',
      qualityRequirement: '清晰可读，服务旁白',
    };
    if (!hasReal && (purpose === 'HOOK' || purpose === 'DEMO') && preferredSource !== 'AI_IMAGE') {
      shot.shootingGuidance = {
        optional: true,
        shotDescription: PURPOSE_LABELS[purpose],
        duration: Math.round(durationMs / 1000),
        framing: '竖屏半身或产品特写',
        action: '按旁白节奏自然口播或展示产品',
        dialogue: seg.narration.slice(0, 80),
      };
    }
    // Ensure every shot has at least one currently available executable source in preferred+fallback
    const path = [shot.preferredSource, ...shot.fallbackSources].filter(materialSourceAvailable);
    if (path.length === 0) {
      shot.preferredSource = 'AI_IMAGE';
      shot.fallbackSources = ['SYSTEM_LIBRARY'];
      shot.selectedAssetId = undefined;
    } else if (!materialSourceAvailable(shot.preferredSource)) {
      shot.preferredSource = path[0]!;
      shot.selectedAssetId = undefined;
    }
    return shot;
  });

  if (ranked.length <= 2) warnings.push('LOW_ASSET_DIVERSITY');
  if (input.candidates.some((c) => c.referenceOnly)) warnings.push('REFERENCE_ONLY_ASSET_SKIPPED');

  const uniqueWarnings = [...new Set(warnings)];
  const resolvedVoice = resolveVoiceConfig({
    preferredVoiceId: input.preferences?.preferredVoiceId,
  });
  if (
    input.preferences?.preferredVoiceId &&
    resolvedVoice.resolvedVoiceId !== input.preferences.preferredVoiceId &&
    !input.preferences.preferredVoiceId.startsWith('sys.')
  ) {
    uniqueWarnings.push('VOICE_SELECTION_FALLBACK');
  }
  let voiceStrategy: VoiceStrategy = 'SYSTEM_VOICE';
  if (mode === 'DIGITAL_HUMAN_BROLL') voiceStrategy = 'DIGITAL_HUMAN_VOICE';
  const aspectRatio = input.aspectRatio ?? '9:16';
  const contextHash = computeDirectorContextHash([
    input.scriptId,
    input.scriptVersion,
    input.videoId,
    targetDuration,
    aspectRatio,
    mode,
    ranked.map((c) => c.assetId),
    input.referencePatternIds ?? [],
    input.preferences ?? {},
    CAPABILITY_REGISTRY_VERSION,
  ]);

  const rationale = buildRationale({
    mode,
    hasReal,
    goalCode: input.goalCode,
    shotCount: shots.length,
  });

  return {
    directorVersion: 'v1',
    mode,
    rationale,
    targetDuration,
    aspectRatio,
    voiceStrategy,
    voiceId: resolvedVoice.resolvedVoiceId,
    digitalHumanProfileId:
      mode === 'DIGITAL_HUMAN_BROLL' ? input.eligibleDigitalHumanProfileIds?.[0] : undefined,
    subtitleStrategy: 'STANDARD',
    pacingStrategy: targetDuration <= 20 ? 'FAST' : targetDuration >= 50 ? 'MIXED' : 'MEDIUM',
    visualStrategy: hasReal
      ? '优先复用合格真实素材，不调用 AI 图片作为产品证据'
      : '当前可用真实素材不足，旁白驱动 + 系统画面补齐',
    shots,
    fallbackPolicy: {
      summary: '缺素材时按素材库 → 系统素材 → AI 图片顺序自动补齐；不因单镜头缺失中断整条生产',
      onMissingAsset: fallbackSources,
      onUnavailableCapability: '切换到 VOICEOVER_ASSETS / AI_ASSISTED 可执行路径',
    },
    qualityTargets: {
      openingImpact: '前 1–3 秒建立主题张力',
      visualContinuity: '镜头切换服务旁白，避免无关画面',
      assetAuthenticity: hasReal ? '优先真实素材' : '当前以可执行生成画面为主',
      subtitleReadability: '短句、底部、对齐旁白',
      pacingConsistency: '总时长贴近脚本目标时长',
    },
    productionWarnings: uniqueWarnings.map((code) => ({
      code,
      message: WARNING_LABELS[code],
    })),
    shootingGuidanceSummary: shots.some((s) => s.shootingGuidance)
      ? '如果方便可以补拍部分镜头，真实感会更好；跳过也能自动制作。'
      : undefined,
    referencePatternIds: (input.referencePatternIds ?? []).slice(0, DIRECTOR_LIMITS.maxReferencePatterns),
    contextSnapshot: {
      scriptId: input.scriptId,
      scriptVersion: input.scriptVersion,
      goalCode: input.goalCode,
      strategyId: input.strategyId,
      contentPlanId: input.contentPlanId,
      topicId: input.topicId,
      memorySnapshotVersion: input.memorySnapshotVersion,
      referencePatternIds: (input.referencePatternIds ?? []).slice(0, DIRECTOR_LIMITS.maxReferencePatterns),
      assetCandidateIds: ranked.map((c) => c.assetId),
      capabilityVersion: CAPABILITY_REGISTRY_VERSION,
      contextHash,
    },
    status: 'READY',
  };
}

function pickPreferredShotAsset(
  index: number,
  kind: string,
  preferredAssetIds: string[] | undefined,
  candidates: AssetCandidateView[],
): string | undefined {
  if (!preferredAssetIds?.length) {
    return undefined;
  }
  const ordered = preferredAssetIds
    .map((id) => candidates.find((item) => item.assetId === id))
    .filter((item): item is AssetCandidateView => item != null && item.referenceOnly === false);
  if (!ordered.length) {
    return undefined;
  }
  const videos = ordered.filter((c) => c.mediaType === 'VIDEO' || c.mediaType === 'BROLL');
  const images = ordered.filter((c) => c.mediaType === 'IMAGE');
  const video = videos[0]?.assetId;
  const img = (i: number) => images[Math.min(Math.max(0, i), Math.max(0, images.length - 1))]?.assetId;
  if (kind === 'hook') return video ?? img(0);
  if (kind === 'opening') return img(0) ?? video;
  if (kind === 'ending') return img(2) ?? img(1) ?? video;
  if (kind === 'cta') return img(1) ?? img(2) ?? video;
  const sectionIndex = Math.max(0, index - 2);
  if (sectionIndex === 0) return video ?? img(0);
  if (sectionIndex === 1) return img(0) ?? video;
  if (sectionIndex === 2) return img(1) ?? img(0);
  if (sectionIndex === 3) return img(0) ?? video;
  return video ?? img(0);
}

function buildRationale(input: {
  mode: ProductionMode;
  hasReal: boolean;
  goalCode?: string;
  shotCount: number;
}): string {
  const modeLabel = MODE_LABELS[input.mode];
  if (!input.hasReal) {
    return `当前缺少可用真人/产品成片素材，因此采用「${modeLabel}」：旁白清晰推进，画面由素材库或 AI 图片补齐，共 ${input.shotCount} 个镜头。`;
  }
  return `检测到可用真实素材，因此采用「${modeLabel}」：优先复用合格素材，缺口再自动补齐，共 ${input.shotCount} 个镜头。`;
}

export function validateDirectorOutput(
  plan: ProductionDirectorOutput,
  allowedAssetIds: Set<string>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (plan.status !== 'READY' && plan.status !== 'FAILED') errors.push('invalid status');
  if (!MODE_LABELS[plan.mode]) errors.push('invalid mode');
  if (plan.shots.length < DIRECTOR_LIMITS.minShots || plan.shots.length > DIRECTOR_LIMITS.maxShots) {
    errors.push('shot count out of bounds');
  }
  for (let i = 0; i < plan.shots.length; i += 1) {
    const shot = plan.shots[i]!;
    if (shot.sequence !== i + 1) errors.push(`bad sequence at ${i}`);
    if (!PURPOSE_LABELS[shot.purpose]) errors.push(`bad purpose at ${i}`);
    if (!SOURCE_LABELS[shot.preferredSource]) errors.push(`bad preferredSource at ${i}`);
    if (!Array.isArray(shot.fallbackSources) || shot.fallbackSources.length === 0) {
      // AI_IMAGE only path still needs fallback list non-empty for policy — allow if preferred available
      if (!materialSourceAvailable(shot.preferredSource)) {
        errors.push(`missing fallback at ${i}`);
      }
    }
    const executable = [shot.preferredSource, ...shot.fallbackSources].some(materialSourceAvailable);
    if (!executable) errors.push(`no executable source at ${i}`);
    if (shot.selectedAssetId) {
      if (!allowedAssetIds.has(shot.selectedAssetId)) errors.push(`unknown assetId at ${i}`);
    }
    if (shot.shootingGuidance && shot.shootingGuidance.optional !== true) {
      errors.push(`shooting guidance must be optional at ${i}`);
    }
  }
  const sumMs = plan.shots.reduce((a, s) => a + s.durationMs, 0);
  const targetMs = plan.targetDuration * 1000;
  const drift = Math.abs(sumMs - targetMs) / Math.max(targetMs, 1);
  if (drift > DIRECTOR_LIMITS.durationToleranceRatio + 0.25) {
    // allow wider for EXTRA_BUDGET legacy mapping; still guard extreme
    errors.push('duration overflow');
  }
  const feat = modeHasExecutablePath(plan.mode, {
    hasEligibleRealAssets: plan.shots.some((s) => Boolean(s.selectedAssetId)),
  });
  if (!feat.feasible) {
    // mode may still be ok if every shot has executable fallback
    const allShotsOk = plan.shots.every((s) =>
      [s.preferredSource, ...s.fallbackSources].some(materialSourceAvailable),
    );
    if (!allShotsOk) errors.push('mode not feasible without executable shot paths');
  }
  if (plan.rationale.length > DIRECTOR_LIMITS.maxRationaleChars) errors.push('rationale too long');
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function toDirectorPublicView(
  plan: ProductionDirectorOutput,
  generationVersion?: string,
): ProductionDirectorPublicView {
  const sources = new Set<string>();
  for (const shot of plan.shots) {
    sources.add(SOURCE_LABELS[shot.preferredSource] ?? shot.preferredSource);
  }
  return {
    mode: plan.mode,
    modeLabel: MODE_LABELS[plan.mode],
    rationale: plan.rationale,
    targetDuration: plan.targetDuration,
    shotCount: plan.shots.length,
    voiceStrategyLabel:
      plan.voiceStrategy === 'SYSTEM_VOICE'
        ? '系统旁白'
        : plan.voiceStrategy === 'CUSTOM_VOICE'
          ? '我的声音'
          : plan.voiceStrategy === 'CLONED_VOICE'
            ? '克隆声音'
            : plan.voiceStrategy === 'ORIGINAL_AUDIO'
              ? '原声'
              : plan.voiceStrategy === 'DIGITAL_HUMAN_VOICE'
                ? '数字人配音'
                : '系统旁白',
    subtitleStrategyLabel: plan.subtitleStrategy === 'STANDARD' ? '标准字幕' : plan.subtitleStrategy,
    pacingStrategyLabel:
      plan.pacingStrategy === 'FAST'
        ? '偏快'
        : plan.pacingStrategy === 'SLOW'
          ? '偏慢'
          : plan.pacingStrategy === 'MIXED'
            ? '混合节奏'
            : '适中',
    visualStrategy: plan.visualStrategy,
    sourceOverview: [...sources],
    warnings: plan.productionWarnings.map((w) => w.message),
    shootingGuidance: plan.shots
      .filter((s) => s.shootingGuidance)
      .map((s) => ({
        optional: true as const,
        shotDescription: s.shootingGuidance!.shotDescription,
        duration: s.shootingGuidance!.duration,
        framing: s.shootingGuidance!.framing,
        action: s.shootingGuidance!.action,
      })),
    fallbackSummary: plan.fallbackPolicy.summary,
    referencePatternCount: plan.referencePatternIds.length,
    status: plan.status,
    directorVersion: plan.directorVersion,
    contextHash: plan.contextSnapshot.contextHash,
    generationVersion,
  };
}
