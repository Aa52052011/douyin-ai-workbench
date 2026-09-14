import { createHash } from 'node:crypto';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { FROZEN_SCRIPT_ID, VIDEO_DURATION_MS as LEGACY_SOURCE_DURATION_MS } from '../audio-calibration/audio-integration.js';
import { SELECTED_V2_SHARPEN } from '../audio-calibration/audio-integration.js';

export const GLOBAL_EDITORIAL_DIRECTOR_VERSION = 'global.editorial-director:v1' as const;
export const SCRIPT_TIMELINE_AUTHORITY = 'SCRIPT_IS_TIMELINE_AUTHORITY' as const;
export const LEGACY_SOURCE_TIMELINE = 'LEGACY_SOURCE_DRIVEN_TIMELINE' as const;
export const ACCEPTED_NARRATION_MS = 44_927;
export const INTER_UNIT_PAUSE_MS = 80;
export const PRE_ROLL_MS = 120;
export const POST_ROLL_MS = 350;
export const VISUAL_BREATH_MS = 40;
export const PRIMARY_BGM_PROVIDER = 'MINIMAX_MUSIC_2_6' as const;
export const MINIMAX_MUSIC_PROVIDER_ID = 'minimax.music:v1' as const;
export const MINIMAX_MUSIC_MODEL = 'music-2.6' as const;
export const MINIMAX_MUSIC_OFFICIAL_URL = 'https://api.minimaxi.com/v1/music_generation' as const;

export const DIRECTOR_DUTIES = [
  'ScriptBeatPlanning',
  'NarrationTimingPlanning',
  'VisualRequirementPlanning',
  'AssetRouting',
  'GenerationCapabilityRouting',
  'DigitalHumanRouting',
  'BgmDecision',
  'MusicGenerationRouting',
  'ShotPlanning',
  'RhythmPlanning',
  'TimelineComposition',
  'ProfileAwareComposition',
  'AudioStrategyPlanning',
  'TruthBoundaryEnforcement',
] as const;

export const VISUAL_TYPES = [
  'SCREEN_RECORDING',
  'USER_VIDEO',
  'USER_IMAGE',
  'SCREENSHOT',
  'DIGITAL_HUMAN',
  'AI_IMAGE',
  'AI_VIDEO',
  'MOTION_GRAPHICS',
  'TEXT_CARD',
  'COMPOSITE',
  'KEEP_CURRENT_VISUAL',
] as const;
export type VisualTypeV1 = (typeof VISUAL_TYPES)[number];

export const IDENTITY_PRIORITY = [
  'USER_SELF_VIDEO',
  'USER_SELF_MULTI_PHOTO',
  'USER_SELF_PHOTO',
  'USER_SELECTED_PERSONA',
  'SYSTEM_GENERIC_AVATAR',
] as const;

export const BGM_DECISIONS = ['NEEDED', 'OPTIONAL', 'NOT_NEEDED', 'HUMAN_DECISION_REQUIRED'] as const;
export type BgmDecisionKindV1 = (typeof BGM_DECISIONS)[number];

export const ACCEPTED_TTS_UNIT_MS: Record<string, number> = {
  hook: 5840,
  opening: 8232,
  section1: 5100,
  section2: 4052,
  section3: 5074,
  section4: 5921,
  section5: 5074,
  ending_cta: 5074,
};

const FORBIDDEN_ASSET = 'c59dfd61-d5fe-4794-9117-e993686710ec';
const PRODUCT_INFO_IMAGE = 'b10d7b09-6dc8-41a4-b786-83077e53be73';
const SCREEN_RECORDING = CONTENT_01_NEW_ASSET_ID;

export function frozenScriptUnchanged(): boolean {
  const beats = loadFrozenScriptBeats();
  return beats.length === 8 && beats.every((b) => ACCEPTED_TTS_UNIT_MS[b.id] != null);
}

export function scriptDrivenDurationMs(unitMs = ACCEPTED_TTS_UNIT_MS): number {
  const ids = Object.keys(unitMs);
  const speech = ids.reduce((s, id) => s + unitMs[id], 0);
  const pauses = INTER_UNIT_PAUSE_MS * Math.max(0, ids.length - 1);
  const breaths = VISUAL_BREATH_MS * Math.max(0, ids.length - 1);
  return speech + pauses + breaths + PRE_ROLL_MS + POST_ROLL_MS;
}

export function isLegacySourceDurationAuthority(finalMs: number): boolean {
  return Math.abs(finalMs - LEGACY_SOURCE_DURATION_MS) < 50;
}

export type ScriptBeatPlanV1 = {
  beatId: string;
  narrationUnitId: string;
  textRef: string;
  semanticIntent: string;
  startMs: number;
  endMs: number;
  targetDurationMs: number;
  importance: 'HOOK' | 'CORE' | 'SUPPORT' | 'CLOSE';
  visualGoal: string;
  audioGoal: string;
  mustShow: string[];
  optionalVisuals: string[];
  humanPresenceNeed: 'NONE' | 'OPTIONAL' | 'PREFERRED';
  bgmNeed: 'FOLLOW_GLOBAL' | 'INTRO' | 'LIFT' | 'STEADY' | 'OUTRO';
  truthConstraints: Array<'C5' | 'C6'>;
};

export function layoutBeats(unitMs = ACCEPTED_TTS_UNIT_MS): ScriptBeatPlanV1[] {
  const beats = loadFrozenScriptBeats();
  let cursor = PRE_ROLL_MS;
  return beats.map((beat, index) => {
    const speech = unitMs[beat.id];
    const startMs = cursor;
    const endMs = startMs + speech;
    cursor = endMs + INTER_UNIT_PAUSE_MS + (index === beats.length - 1 ? POST_ROLL_MS : VISUAL_BREATH_MS);
    const meta = beatMeta(beat.id);
    return {
      beatId: `beat:${beat.id}`,
      narrationUnitId: `nu:${beat.id}`,
      textRef: `script-beat:${beat.id}`,
      semanticIntent: meta.semanticIntent,
      startMs,
      endMs,
      targetDurationMs: speech,
      importance: meta.importance,
      visualGoal: meta.visualGoal,
      audioGoal: 'Keep accepted MiniMax TTS narration; do not retone or resample.',
      mustShow: meta.mustShow,
      optionalVisuals: meta.optionalVisuals,
      humanPresenceNeed: meta.humanPresenceNeed,
      bgmNeed: meta.bgmNeed,
      truthConstraints: meta.truthConstraints,
    };
  });
}

function beatMeta(id: string) {
  const c5c6 = { truthConstraints: ['C5', 'C6'] as Array<'C5' | 'C6'> };
  if (id === 'hook') {
    return {
      semanticIntent: '纠正“只是写文案的AI”误解，展示工作台真实环节',
      importance: 'HOOK' as const,
      visualGoal: '一眼看到真实工作台导航/流程，而不是数字人口播片头',
      mustShow: ['真实工作台导航', '流程入口'],
      optionalVisuals: ['轻微光标移动'],
      humanPresenceNeed: 'OPTIONAL' as const,
      bgmNeed: 'INTRO' as const,
      ...c5c6,
    };
  }
  if (id === 'opening') {
    return {
      semanticIntent: '说明账号是用自己的抖音内容做真实测试',
      importance: 'CORE' as const,
      visualGoal: '产品工作台/产品信息页，证明这是制作工具而非纯文案工具',
      mustShow: ['真实产品信息页或工作台'],
      optionalVisuals: ['创作者本人出镜（若有本人素材）'],
      humanPresenceNeed: 'OPTIONAL' as const,
      bgmNeed: 'STEADY' as const,
      ...c5c6,
    };
  }
  if (id === 'section1') {
    return {
      semanticIntent: '选题、策略、脚本、制作在一条流程里',
      importance: 'CORE' as const,
      visualGoal: '侧栏信息架构完整可读',
      mustShow: ['内容计划', '制作中心', '脚本入口'],
      optionalVisuals: ['顶栏流程条'],
      humanPresenceNeed: 'NONE' as const,
      bgmNeed: 'STEADY' as const,
      ...c5c6,
    };
  }
  if (id === 'section2') {
    return {
      semanticIntent: '从真实需求开始，记录系统产出和人工修改',
      importance: 'CORE' as const,
      visualGoal: '需求输入与可编辑结果，不假装已拍到完整“输入→生成脚本”',
      mustShow: ['需求/产品信息整理界面'],
      optionalVisuals: ['人工修改痕迹'],
      humanPresenceNeed: 'NONE' as const,
      bgmNeed: 'STEADY' as const,
      ...c5c6,
    };
  }
  if (id === 'section3') {
    return {
      semanticIntent: '成片仍需人工审核，最后手动发布',
      importance: 'CORE' as const,
      visualGoal: '人工门槛；禁止完成态自动发布成功页',
      mustShow: ['需确认/审核的制作界面'],
      optionalVisuals: ['发布页空态或未完成态'],
      humanPresenceNeed: 'NONE' as const,
      bgmNeed: 'STEADY' as const,
      ...c5c6,
    };
  }
  if (id === 'section4') {
    return {
      semanticIntent: '留下耗时返工版本，不预设爆款、不夸大自动化',
      importance: 'SUPPORT' as const,
      visualGoal: '中性结构/字幕，不要假数据看板',
      mustShow: ['中性工作台结构或文字卡'],
      optionalVisuals: ['版本列表（若真实存在）'],
      humanPresenceNeed: 'NONE' as const,
      bgmNeed: 'STEADY' as const,
      ...c5c6,
    };
  }
  if (id === 'section5') {
    return {
      semanticIntent: '接下来只看证据：录屏、对比、真实成片',
      importance: 'SUPPORT' as const,
      visualGoal: '真实素材中心，空态也要诚实',
      mustShow: ['素材中心或真实录屏证据'],
      optionalVisuals: ['前后对比卡'],
      humanPresenceNeed: 'NONE' as const,
      bgmNeed: 'LIFT' as const,
      ...c5c6,
    };
  }
  return {
    semanticIntent: '按结果评价，邀请留言测哪个环节',
    importance: 'CLOSE' as const,
    visualGoal: '真实下一步入口，无购买CTA；数字人仅在有本人素材时可选',
    mustShow: ['去脚本/发布运营等真实入口'],
    optionalVisuals: ['创作者本人出镜CTA'],
    humanPresenceNeed: 'PREFERRED' as const,
    bgmNeed: 'OUTRO' as const,
    ...c5c6,
  };
}

export type VisualRequirementPlanV1 = {
  beatId: string;
  visualIntent: string;
  requiredSemanticObjects: string[];
  preferredVisualType: VisualTypeV1;
  fallbackVisualTypes: VisualTypeV1[];
  minimumDurationMs: number;
  motionNeed: 'NONE' | 'LOW' | 'MEDIUM';
  humanPresenceNeed: ScriptBeatPlanV1['humanPresenceNeed'];
  uiReadabilityNeed: 'IDENTIFIABLE' | 'READABLE' | 'CLAIM_CRITICAL_READABLE';
  sourceAuthenticityNeed: 'REQUIRED' | 'PREFERRED';
};

export function visualRequirements(beats: ScriptBeatPlanV1[]): VisualRequirementPlanV1[] {
  return beats.map((beat) => {
    const id = beat.beatId.replace('beat:', '');
    return {
      beatId: beat.beatId,
      visualIntent: beat.visualGoal,
      requiredSemanticObjects: beat.mustShow,
      preferredVisualType:
        id === 'opening' ? 'COMPOSITE' : id === 'ending_cta' ? 'SCREENSHOT' : 'SCREEN_RECORDING',
      fallbackVisualTypes:
        id === 'ending_cta'
          ? ['USER_VIDEO', 'DIGITAL_HUMAN', 'TEXT_CARD']
          : id === 'section4'
            ? ['SCREENSHOT', 'MOTION_GRAPHICS', 'TEXT_CARD']
            : id === 'section2'
              ? ['SCREENSHOT', 'AI_VIDEO', 'KEEP_CURRENT_VISUAL']
              : ['SCREENSHOT', 'KEEP_CURRENT_VISUAL'],
      minimumDurationMs: beat.targetDurationMs,
      motionNeed: id === 'hook' || id === 'section1' ? 'LOW' : 'NONE',
      humanPresenceNeed: beat.humanPresenceNeed,
      uiReadabilityNeed: id === 'section1' ? 'CLAIM_CRITICAL_READABLE' : 'READABLE',
      sourceAuthenticityNeed: 'REQUIRED',
    };
  });
}

export type CoverageKind = 'FULLY_COVERED' | 'PARTIALLY_COVERED' | 'NOT_COVERED';

export type AssetRouteV1 = {
  beatId: string;
  coverage: CoverageKind;
  primaryAssetId: string | null;
  primaryType: VisualTypeV1;
  fallback: string;
  reuseFirst: true;
  generationNeeded: boolean;
  generationCapability: string | null;
  rejectedAssets: string[];
};

export function routeAssets(beats: ScriptBeatPlanV1[]): AssetRouteV1[] {
  return beats.map((beat) => {
    const id = beat.beatId.replace('beat:', '');
    const rejected = [FORBIDDEN_ASSET];
    if (id === 'hook' || id === 'section1') {
      return {
        beatId: beat.beatId,
        coverage: 'FULLY_COVERED',
        primaryAssetId: SCREEN_RECORDING,
        primaryType: 'SCREEN_RECORDING',
        fallback: 'KEEP_CURRENT_VISUAL same recording WIDE_FIRST',
        reuseFirst: true,
        generationNeeded: false,
        generationCapability: null,
        rejectedAssets: rejected,
      };
    }
    if (id === 'opening') {
      return {
        beatId: beat.beatId,
        coverage: 'PARTIALLY_COVERED',
        primaryAssetId: PRODUCT_INFO_IMAGE,
        primaryType: 'USER_IMAGE',
        fallback: `${SCREEN_RECORDING} WIDE_FIRST`,
        reuseFirst: true,
        generationNeeded: false,
        generationCapability: null,
        rejectedAssets: rejected,
      };
    }
    if (id === 'section2') {
      return {
        beatId: beat.beatId,
        coverage: 'PARTIALLY_COVERED',
        primaryAssetId: SCREEN_RECORDING,
        primaryType: 'SCREEN_RECORDING',
        fallback: 'honest screenshot of product-info panel; optional AI_VIDEO only if human later approves missing process capture',
        reuseFirst: true,
        generationNeeded: true,
        generationCapability: 'AI_VIDEO',
        rejectedAssets: rejected,
      };
    }
    if (id === 'section4') {
      return {
        beatId: beat.beatId,
        coverage: 'PARTIALLY_COVERED',
        primaryAssetId: SCREEN_RECORDING,
        primaryType: 'SCREEN_RECORDING',
        fallback: 'TRANSFORM_FIRST crop/zoom/highlight/annotation on real UI; rejected AI poster must not enter timeline',
        reuseFirst: true,
        generationNeeded: false,
        generationCapability: null,
        rejectedAssets: rejected,
      };
    }
    if (id === 'ending_cta') {
      return {
        beatId: beat.beatId,
        coverage: 'PARTIALLY_COVERED',
        primaryAssetId: SCREEN_RECORDING,
        primaryType: 'SCREEN_RECORDING',
        fallback: 'real next-step control; digital human only with USER_SELF media',
        reuseFirst: true,
        generationNeeded: true,
        generationCapability: 'DIGITAL_HUMAN',
        rejectedAssets: rejected,
      };
    }
    return {
      beatId: beat.beatId,
      coverage: 'PARTIALLY_COVERED',
      primaryAssetId: SCREEN_RECORDING,
      primaryType: 'SCREEN_RECORDING',
      fallback: 'WIDE_FIRST keep whole UI; do not invent auto-publish success',
      reuseFirst: true,
      generationNeeded: false,
      generationCapability: null,
      rejectedAssets: rejected,
    };
  });
}

export function coverageAudit(routes: AssetRouteV1[]) {
  const fully = routes.filter((r) => r.coverage === 'FULLY_COVERED').length;
  const partial = routes.filter((r) => r.coverage === 'PARTIALLY_COVERED').length;
  const uncovered = routes.filter((r) => r.coverage === 'NOT_COVERED').length;
  const gen = routes.filter((r) => r.generationNeeded).length;
  return {
    totalBeats: routes.length,
    fullyCovered: fully,
    partiallyCovered: partial,
    uncovered,
    estimatedReuseRatio: Number(((routes.length - uncovered) / routes.length).toFixed(2)),
    estimatedGenerationRatio: Number((gen / routes.length).toFixed(2)),
  };
}

export function generationRequests(routes: AssetRouteV1[], beats: ScriptBeatPlanV1[]) {
  return routes
    .filter((r) => r.generationNeeded)
    .map((r) => {
      const beat = beats.find((b) => b.beatId === r.beatId)!;
      const capability = r.generationCapability === 'AI_VIDEO' ? 'AI_VIDEO' : r.generationCapability === 'AI_IMAGE' ? 'AI_IMAGE' : 'DIGITAL_HUMAN';
      return {
        requestId: `gen:${r.beatId}`,
        beatId: r.beatId,
        capabilityType: capability,
        purpose: beat.visualGoal,
        targetDurationMs: capability === 'AI_VIDEO' ? beat.targetDurationMs : undefined,
        targetAspect: 'GENERATE_SEPARATE_VERTICAL_AND_LANDSCAPE' as const,
        visualDescription: beat.semanticIntent,
        identityRequirement: capability === 'DIGITAL_HUMAN' ? 'USER_SELF_FIRST' : undefined,
        sourceReferences: [SCREEN_RECORDING],
        truthConstraints: beat.truthConstraints,
        status: 'PLANNED' as const,
        executeNow: false,
        visualAuthenticityPolicy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY' as const,
        productReferenceAssetIds: [SCREEN_RECORDING],
        styleConsistencyRequired: true,
        advertisingIntensity: 'LOW' as const,
        truthVisualConstraints: beat.truthConstraints,
        genericAIVisualAllowed: false,
      };
    });
}

export function creatorIdentityPolicy() {
  return {
    schemaVersion: 'creator.identity-policy:v1',
    default: 'USER_SELF_FIRST',
    priority: IDENTITY_PRIORITY,
    digitalHumanMandatory: false,
    silentGenericAvatarForbidden: true,
    genericAvatarRequiresExplicitUserChoice: true,
    missingSelfIdentity: 'IDENTITY_ASSET_REQUIRED',
    narrationVoiceApprovedIsNotVoiceClone: true,
  };
}

export function creatorIdentityProfileContract() {
  return {
    schemaVersion: 'creator.identity-profile:v1',
    requiredFields: [
      'creatorIdentityProfileId',
      'tenantId',
      'workspaceId',
      'creatorUserId',
      'preferredIdentityMode',
      'selfVideoAssets',
      'selfPhotoAssets',
      'genericAvatarAllowed',
      'digitalHumanEnabled',
      'consentState',
    ],
    content01Inventory: {
      selfVideoAvailable: false,
      selfPhotoAvailable: false,
      selectedPersonaAssetId: null,
      genericAvatarAllowed: false,
      digitalHumanEnabled: true,
      consentState: 'NOT_COLLECTED',
    },
  };
}

export function decideBgm(input: {
  contentType: string;
  narrationDensity: 'HIGH' | 'MEDIUM' | 'LOW';
  hasUserBgm: boolean;
  hasLicensedBgm: boolean;
  musicCapability: boolean;
}): { decision: BgmDecisionKindV1; route: string; reason: string } {
  if (input.narrationDensity === 'HIGH' && input.contentType === 'SCREEN_RECORDING_UI_DEMO') {
    return {
      decision: 'OPTIONAL',
      route: input.hasUserBgm ? 'USER_BGM_LIBRARY' : input.hasLicensedBgm ? 'SYSTEM_LICENSED_BGM_LIBRARY' : input.musicCapability ? 'AI_MUSIC_PROVIDER' : 'NO_BGM_IF_DIRECTOR_DECIDES_NOT_NEEDED',
      reason: 'Dense accepted narration can stand alone; light instrumental may support rhythm without being mandatory.',
    };
  }
  return { decision: 'NOT_NEEDED', route: 'NO_BGM_IF_DIRECTOR_DECIDES_NOT_NEEDED', reason: 'Director default: do not force BGM.' };
}

export function bgmRouterOrder() {
  return ['USER_BGM_LIBRARY', 'SYSTEM_LICENSED_BGM_LIBRARY', 'AI_MUSIC_PROVIDER', 'NO_BGM_IF_DIRECTOR_DECIDES_NOT_NEEDED', 'MISSING_BGM_CAPABILITY'] as const;
}

export function buildBgmBrief(plannedDurationMs: number) {
  return {
    bgmBriefId: 'bgm-brief:content-01:v1',
    purpose: 'support rhythm without competing with voice',
    mood: 'clean modern technology',
    genre: 'minimal electronic / product demo',
    tempoPreference: 'moderate',
    energy: 'low-to-medium',
    instrumentationPreferences: ['soft synth pad', 'light pulse'],
    avoidInstruments: ['lead vocal', 'aggressive drop', 'trap 808'],
    vocalsAllowed: false,
    narrationFriendly: true,
    targetDurationMs: plannedDurationMs,
    introStyle: 'INTRO',
    middleEnergy: 'STEADY',
    outroStyle: 'OUTRO',
    loopAllowed: true,
    fadeInMs: 400,
    fadeOutMs: 600,
    duckingRequired: true,
    profileApplicability: ['VERTICAL_9_16', 'LANDSCAPE_16_9'],
    truthConstraints: ['C5', 'C6'],
  };
}

export function audioMixPlan(plannedDurationMs: number, bgmDecision: BgmDecisionKindV1) {
  return {
    narrationAssetRef: 'accepted-minimax-tts-content-01',
    bgmDecision,
    bgmAssetRef: null,
    narrationPriority: 'HIGH',
    duckingPolicy: { narrationPresentDb: [-14, -8], dryRestore: true },
    targetLufs: [-16, -14],
    maxTruePeak: -1,
    fadePolicy: { inMs: 40, outMs: 250, bgmInMs: 400, bgmOutMs: 600 },
    finalCodec: 'aac-48000-stereo-160k',
    timelineDurationMs: plannedDurationMs,
    doNotRegenerateTts: true,
  };
}

export function shotPlan(beats: ScriptBeatPlanV1[], routes: AssetRouteV1[]) {
  return beats.map((beat, index) => {
    const route = routes[index];
    const id = beat.beatId.replace('beat:', '');
    return {
      shotId: `shot:${beat.beatId}:primary`,
      beatId: beat.beatId,
      startMs: beat.startMs,
      endMs: beat.endMs,
      durationMs: beat.endMs - beat.startMs,
      visualType: route.primaryType,
      sourceAssetId: route.primaryAssetId,
      generationRequestId: route.generationNeeded ? `gen:${beat.beatId}` : null,
      compositionMode: route.primaryType === 'SCREEN_RECORDING' ? 'SMART_UI_FIT_WIDE_FIRST' : 'FIT_NO_STRETCH',
      shotScale: 'WIDE_FIRST',
      motionPolicy: id === 'section4' ? 'SUBTLE_FOCUS_ZOOM_HIGHLIGHT' : 'NO_KEN_BURNS_UNLESS_STILL',
      narrationBinding: beat.narrationUnitId,
      semanticPurpose: beat.semanticIntent,
      profileBehavior: {
        vertical: { width: 1080, height: 1920, sharpen: route.primaryType === 'SCREEN_RECORDING' ? SELECTED_V2_SHARPEN : 'NONE' },
        landscape: { width: 1920, height: 1080, screenRecording: 'scale-to-fit-no-stretch' },
      },
    };
  });
}

export function lastFrameFreezeHackUsed(): false {
  return false;
}

export function musicCredentialStatus(env: NodeJS.ProcessEnv): {
  status: 'REUSED_EXISTING' | 'MANUAL_CONFIGURATION_REQUIRED' | 'NOT_TESTED_NO_REAL_CALL';
  reuseTtsSecret: boolean;
  envRequiredNow: string[];
} {
  const hasTtsKey = Boolean(env.MINIMAX_TTS_API_KEY?.trim());
  const hasTtsUrl = Boolean(env.MINIMAX_TTS_BASE_URL?.trim());
  if (!hasTtsKey) {
    return { status: 'MANUAL_CONFIGURATION_REQUIRED', reuseTtsSecret: false, envRequiredNow: ['MINIMAX_TTS_API_KEY'] };
  }
  return {
    status: 'NOT_TESTED_NO_REAL_CALL',
    reuseTtsSecret: true,
    envRequiredNow: [],
  };
}

export function joinMusicGenerationUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MINIMAX_MUSIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (override) {
    return override.endsWith('/music_generation') ? override : `${override}/music_generation`;
  }
  return MINIMAX_MUSIC_OFFICIAL_URL;
}

export function minimaxMusicCapabilities() {
  return {
    providerId: MINIMAX_MUSIC_PROVIDER_ID,
    modelName: MINIMAX_MUSIC_MODEL,
    supportsInstrumental: true,
    supportsPromptBasedMusic: true,
    supportsDurationControl: true,
    supportsSeedIfApplicable: true,
    supportedOutputFormats: ['mp3', 'wav'],
    officialEndpoint: MINIMAX_MUSIC_OFFICIAL_URL,
    defaultMode: 'INSTRUMENTAL',
  };
}

export function buildMusicRequestStub(brief: ReturnType<typeof buildBgmBrief>) {
  return {
    endpoint: MINIMAX_MUSIC_OFFICIAL_URL,
    model: MINIMAX_MUSIC_MODEL,
    instrumentalIntent: true,
    vocalsAllowed: brief.vocalsAllowed,
    targetDurationMs: brief.targetDurationMs,
    execute: false,
    note: 'Field names must follow current official Music Generation schema at call time; do not invent unverified keys.',
  };
}

export async function generateInstrumentalBgm(): Promise<never> {
  throw new Error('MINIMAX_MUSIC_NO_REAL_CALL_THIS_STEP');
}

export function buildContent01DirectorPlan() {
  if (!frozenScriptUnchanged()) throw new Error('FROZEN_SCRIPT_CHANGED');
  const plannedDurationMs = scriptDrivenDurationMs();
  if (isLegacySourceDurationAuthority(plannedDurationMs)) throw new Error('SOURCE_DURATION_MUST_NOT_AUTHOR_FINAL');
  const beats = layoutBeats();
  const visuals = visualRequirements(beats);
  const routes = routeAssets(beats);
  const coverage = coverageAudit(routes);
  const gens = generationRequests(routes, beats);
  const bgm = decideBgm({
    contentType: 'SCREEN_RECORDING_UI_DEMO',
    narrationDensity: 'HIGH',
    hasUserBgm: false,
    hasLicensedBgm: false,
    musicCapability: true,
  });
  const brief = bgm.decision === 'NOT_NEEDED' ? null : buildBgmBrief(plannedDurationMs);
  const shots = shotPlan(beats, routes);
  return {
    schemaVersion: GLOBAL_EDITORIAL_DIRECTOR_VERSION,
    timelineId: `timeline:${FROZEN_SCRIPT_ID}:script-driven:v1`,
    scriptId: FROZEN_SCRIPT_ID,
    authority: SCRIPT_TIMELINE_AUTHORITY,
    legacyTimeline: LEGACY_SOURCE_TIMELINE,
    narrationDurationMs: ACCEPTED_NARRATION_MS,
    plannedDurationMs,
    status: 'PLANNED' as const,
    duties: DIRECTOR_DUTIES,
    beats,
    visualRequirements: visuals,
    routes,
    coverage,
    generationRequests: gens,
    shots,
    shotQuota: 'NONE' as const,
    lastFrameFreezeHack: lastFrameFreezeHackUsed(),
    creatorIdentity: creatorIdentityPolicy(),
    identityInventory: creatorIdentityProfileContract().content01Inventory,
    bgm,
    bgmBrief: brief,
    audioMix: audioMixPlan(plannedDurationMs, bgm.decision),
    energyCurve: ['INTRO', 'STEADY', 'STEADY', 'STEADY', 'STEADY', 'STEADY', 'LIFT', 'OUTRO'],
    truthConstraints: ['C5', 'C6'],
    verticalProfile: {
      resolution: '1080x1920',
      screenRecording: 'WIDE_FIRST+V2_LIGHT_SHARPEN',
      generatedAspect: '9:16',
      fidelity: 'V2_LIGHT_SHARPEN_SELECTED',
    },
    landscapeProfile: {
      resolution: '1920x1080',
      screenRecording: 'source-native scale-to-fit no-stretch',
      generatedAspect: '16:9',
    },
    fingerprint: createHash('sha256').update(JSON.stringify(loadFrozenScriptBeats().map((b) => b.narration))).digest('hex'),
  };
}
