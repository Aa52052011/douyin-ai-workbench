import { CONTENT_01_REVIEW_SESSION_ID } from '../dynamic-reframe/human-feedback.js';
import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import {
  FROZEN_SCRIPT_ID,
  FROZEN_SCRIPT_VERSION,
  SELECTED_V2_SHARPEN,
} from '../audio-calibration/audio-integration.js';
import {
  ACCEPTED_NARRATION_MS,
  MINIMAX_MUSIC_MODEL,
  MINIMAX_MUSIC_OFFICIAL_URL,
  PRIMARY_BGM_PROVIDER,
  buildContent01DirectorPlan,
} from './director-v1.js';
import { wanxiangVideoStatus } from './wanxiang-video-contract.js';
import {
  IMAGE_PROVIDER_COLOR_BACKGROUND,
  IMAGE_PROVIDER_MINIMAX,
  IMAGE_PROVIDER_WANX,
} from '../../media/visual/visual-config.js';
import { isWanxImageConfigured } from '../../media/visual/wanx-config.js';
import {
  DEFAULT_MINIMAX_TIMEOUT_MS,
  isMiniMaxTtsConfigured,
} from '../../media/tts/minimax-tts-config.js';

export const DIRECTOR_EXECUTION_MANIFEST_VERSION = 'director.execution-manifest:v1' as const;
export const PLANNED_DURATION_MS = 45_677;
export const DURATION_TOLERANCE = { minMs: 45_000, maxMs: 47_500 };
export const FROZEN_TENANT_ID = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
export const FROZEN_WORKSPACE_ID = '01a08b24-3e55-7022-82c1-7bfa494e755b';
export const FROZEN_PROJECT_ID = '01a08b3f-9638-7fd1-a1ee-344682fb4809';

export const TASK_TYPES = [
  'REUSE_ASSET',
  'EXTRACT_SCREEN_SEGMENT',
  'REFRAME_SCREEN_RECORDING',
  'SCREENSHOT_MOTION',
  'GENERATE_AI_VIDEO',
  'GENERATE_AI_IMAGE',
  'GENERATE_DIGITAL_HUMAN',
  'GENERATE_BGM',
  'MIX_AUDIO',
  'ASSEMBLE_TIMELINE',
  'RENDER_VERTICAL',
  'RENDER_LANDSCAPE',
  'VALIDATE_ARTIFACT',
] as const;
export type ExecutionTaskTypeV1 = (typeof TASK_TYPES)[number];

export const PREP_STATUSES = ['READY', 'BLOCKED', 'OPTIONAL', 'NOT_NEEDED', 'WAITING_FOR_DEPENDENCY', 'DO_NOT_EXECUTE', 'OPTIONAL_READY', 'OPTIONAL_CONFIG_BLOCKED', 'BLOCKED_BY_IDENTITY_ASSET'] as const;
export type PrepTaskStatusV1 = (typeof PREP_STATUSES)[number];

export type ExecutionTaskV1 = {
  taskId: string;
  type: ExecutionTaskTypeV1;
  beatId: string | null;
  required: boolean;
  classification: 'REQUIRED' | 'ENHANCEMENT' | 'OPTIONAL';
  executeStatus: PrepTaskStatusV1;
  dependencies: string[];
  fallbackTaskId: string | null;
  profileScope: 'SHARED' | 'VERTICAL' | 'LANDSCAPE' | 'DUAL';
  truthConstraints: Array<'C5' | 'C6'>;
};

function usable(id: string): 'FULLY_USABLE' | 'PARTIAL_ONLY' | 'NOT_SUITABLE' {
  if (id === 'hook' || id === 'section1') return 'FULLY_USABLE';
  if (id === 'ending_cta') return 'PARTIAL_ONLY';
  return 'PARTIAL_ONLY';
}

export function coverageMetricsV2() {
  return {
    existingAssetCoverageRatio: 1,
    generationEnhancementRatio: 0.38,
    fallbackCoverageRatio: 1,
    explanation:
      'All 8 beats have a real screen-recording or product-image fallback, so ExistingAssetCoverageRatio=1.00. Three generation requests remain as ENHANCEMENT (process gap, C6-safe card, optional CTA face), not because core visuals are missing.',
  };
}

export function lockAiVideoRequest() {
  return {
    requestId: 'gen:beat:section2',
    beatId: 'beat:section2',
    purpose: 'Fill honest process-gap for 需求输入→人工修改 without claiming a full script-generation recording exists',
    semanticIntent: '从真实需求开始，记录系统产出和人工修改',
    targetDurationMs: 4052,
    verticalAspectRequirement: '9:16',
    landscapeAspectRequirement: '16:9',
    generationMode: 'GENERATE_SEPARATE_VERTICAL_AND_LANDSCAPE' as const,
    promptBrief: 'Neutral product-workbench UI process, demand input to editable result, no auto-publish success, no growth dashboard',
    negativeConstraints: ['无人值守自动发布成功页', '保证爆款/增长/收益', 'stranger talking-head as default'],
    truthConstraints: ['C5', 'C6'] as Array<'C5' | 'C6'>,
    sourceReferences: [CONTENT_01_NEW_ASSET_ID],
    executeNow: false as const,
    classification: 'ENHANCEMENT' as const,
    required: false,
  };
}

export function lockAiImageRequest() {
  return {
    requestId: 'gen:beat:section4',
    beatId: 'beat:section4',
    purpose: '中性表达“不预设爆款/不保证结果”',
    semanticIntent: '留下耗时返工版本，不预设爆款、不夸大自动化',
    generationMode: 'GENERATE_SEPARATE_VERTICAL_AND_LANDSCAPE' as const,
    promptBrief: 'Calm text-card or UI still: no guaranteed success, no KPI wall, no auto-publish',
    negativeConstraints: ['保证爆款', '保证增长', '保证收益', 'completed auto-publish'],
    truthConstraints: ['C6', 'C5'] as Array<'C5' | 'C6'>,
    sourceReferences: [CONTENT_01_NEW_ASSET_ID],
    executeNow: false as const,
    classification: 'ENHANCEMENT' as const,
    required: false,
  };
}

export function lockDigitalHumanRequest() {
  return {
    requestId: 'gen:beat:ending_cta',
    beatId: 'beat:ending_cta',
    purpose: 'Optional creator-present CTA',
    classification: 'OPTIONAL' as const,
    required: false,
    executeNow: false as const,
    identityPolicy: 'USER_SELF_FIRST',
    selfVideoAvailable: false,
    selfPhotoAvailable: false,
    genericAvatarAllowed: false,
    status: 'BLOCKED_BY_IDENTITY_ASSET' as const,
    truthConstraints: ['C5', 'C6'] as Array<'C5' | 'C6'>,
  };
}

export function creatorIdentityRequirement() {
  return {
    schemaVersion: 'creator.identity-requirement:v1',
    digitalHumanRequested: 'OPTIONAL',
    selfIdentityRequired: 'YES_IF_DIGITAL_HUMAN_USED',
    availableSelfVideoAssets: 0,
    availableSelfPhotoAssets: 0,
    genericAvatarAllowed: false,
    fallbackAvailable: true,
  };
}

export function musicCredentialReuse(env: NodeJS.ProcessEnv = process.env): {
  status: 'REUSED_EXISTING_CONFIG_UNVERIFIED_FOR_MUSIC' | 'MANUAL_CONFIGURATION_REQUIRED' | 'MISSING_EXISTING_MINIMAX_CREDENTIAL';
  envRequiredNow: string[];
} {
  const hasKey = Boolean(env.MINIMAX_TTS_API_KEY?.trim());
  if (!hasKey) return { status: 'MISSING_EXISTING_MINIMAX_CREDENTIAL', envRequiredNow: ['MINIMAX_TTS_API_KEY'] };
  return { status: 'REUSED_EXISTING_CONFIG_UNVERIFIED_FOR_MUSIC', envRequiredNow: [] };
}

export function imageProviderStatus(): {
  available: 'AVAILABLE_PROVIDER' | 'NO_PROVIDER';
  id: string;
  implementations: string[];
  wanxConfigured: boolean;
  wanxiangVideoStatus: 'NOT_IMPLEMENTED';
} {
  return {
    available: 'AVAILABLE_PROVIDER',
    id: IMAGE_PROVIDER_WANX,
    implementations: [IMAGE_PROVIDER_WANX, IMAGE_PROVIDER_COLOR_BACKGROUND, IMAGE_PROVIDER_MINIMAX],
    wanxConfigured: isWanxImageConfigured(),
    wanxiangVideoStatus: wanxiangVideoStatus(),
  };
}

export function buildExecutionManifest(env: NodeJS.ProcessEnv = process.env) {
  const director = buildContent01DirectorPlan();
  if (director.plannedDurationMs !== PLANNED_DURATION_MS) throw new Error('PLANNED_DURATION_DRIFT');
  const music = musicCredentialReuse(env);
  const image = imageProviderStatus();
  const bgmTaskStatus: PrepTaskStatusV1 = music.status === 'REUSED_EXISTING_CONFIG_UNVERIFIED_FOR_MUSIC' ? 'OPTIONAL_READY' : 'OPTIONAL_CONFIG_BLOCKED';

  const beatTasks: ExecutionTaskV1[] = [];
  const mappings = director.beats.map((beat) => {
    const id = beat.beatId.replace('beat:', '');
    const extractId = `task:extract:${id}`;
    const reframeId = `task:reframe:${id}`;
    beatTasks.push({
      taskId: extractId,
      type: id === 'opening' ? 'REUSE_ASSET' : 'EXTRACT_SCREEN_SEGMENT',
      beatId: beat.beatId,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'READY',
      dependencies: ['task:frozen-script', 'task:accepted-narration'],
      fallbackTaskId: null,
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    });
    beatTasks.push({
      taskId: reframeId,
      type: 'REFRAME_SCREEN_RECORDING',
      beatId: beat.beatId,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'READY',
      dependencies: [extractId],
      fallbackTaskId: null,
      profileScope: 'DUAL',
      truthConstraints: ['C5', 'C6'],
    });
    const generationRequests: string[] = [];
    let enhancement: ExecutionTaskV1 | null = null;
    if (id === 'section2') {
      enhancement = {
        taskId: 'task:gen-ai-video:section2',
        type: 'GENERATE_AI_VIDEO',
        beatId: beat.beatId,
        required: false,
        classification: 'ENHANCEMENT',
        executeStatus: 'OPTIONAL',
        dependencies: [reframeId],
        fallbackTaskId: reframeId,
        profileScope: 'DUAL',
        truthConstraints: ['C5', 'C6'],
      };
      generationRequests.push(lockAiVideoRequest().requestId);
    }
    if (id === 'section4') {
      enhancement = {
        taskId: 'task:gen-ai-image:section4',
        type: 'GENERATE_AI_IMAGE',
        beatId: beat.beatId,
        required: false,
        classification: 'ENHANCEMENT',
        executeStatus: 'DO_NOT_EXECUTE',
        dependencies: [reframeId],
        fallbackTaskId: reframeId,
        profileScope: 'DUAL',
        truthConstraints: ['C5', 'C6'],
      };
      generationRequests.push(lockAiImageRequest().requestId);
    }
    if (id === 'ending_cta') {
      enhancement = {
        taskId: 'task:gen-dh:ending',
        type: 'GENERATE_DIGITAL_HUMAN',
        beatId: beat.beatId,
        required: false,
        classification: 'OPTIONAL',
        executeStatus: 'BLOCKED_BY_IDENTITY_ASSET',
        dependencies: [],
        fallbackTaskId: 'task:fallback-cta',
        profileScope: 'DUAL',
        truthConstraints: ['C5', 'C6'],
      };
      generationRequests.push(lockDigitalHumanRequest().requestId);
      beatTasks.push({
        taskId: 'task:fallback-cta',
        type: 'SCREENSHOT_MOTION',
        beatId: beat.beatId,
        required: true,
        classification: 'REQUIRED',
        executeStatus: 'READY',
        dependencies: [extractId],
        fallbackTaskId: null,
        profileScope: 'DUAL',
        truthConstraints: ['C5', 'C6'],
      });
    }
    if (enhancement) beatTasks.push(enhancement);
    return {
      beatId: beat.beatId,
      narrationUnitId: beat.narrationUnitId,
      startMs: beat.startMs,
      endMs: beat.endMs,
      durationMs: beat.targetDurationMs,
      semanticIntent: beat.semanticIntent,
      existingAssetUsable: usable(id),
      primaryVisualTask: reframeId,
      fallbackTask: id === 'ending_cta' ? 'task:fallback-cta' : reframeId,
      requiredAssets: [CONTENT_01_NEW_ASSET_ID],
      generationRequests,
      verticalBehavior: { width: 1080, height: 1920, screen: `WIDE_FIRST+${SELECTED_V2_SHARPEN}` },
      landscapeBehavior: { width: 1920, height: 1080, screen: 'source-native-no-stretch' },
      bgmEnergyHint: beat.bgmNeed,
      truthConstraints: beat.truthConstraints,
    };
  });

  const globalTasks: ExecutionTaskV1[] = [
    {
      taskId: 'task:frozen-script',
      type: 'VALIDATE_ARTIFACT',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'READY',
      dependencies: [],
      fallbackTaskId: null,
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:accepted-narration',
      type: 'VALIDATE_ARTIFACT',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'READY',
      dependencies: [],
      fallbackTaskId: null,
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:generate-bgm',
      type: 'GENERATE_BGM',
      beatId: null,
      required: false,
      classification: 'OPTIONAL',
      executeStatus: bgmTaskStatus,
      dependencies: ['task:accepted-narration'],
      fallbackTaskId: 'task:mix-a',
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:mix-a',
      type: 'MIX_AUDIO',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'READY',
      dependencies: ['task:accepted-narration'],
      fallbackTaskId: null,
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:mix-b',
      type: 'MIX_AUDIO',
      beatId: null,
      required: false,
      classification: 'OPTIONAL',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: ['task:accepted-narration', 'task:generate-bgm'],
      fallbackTaskId: 'task:mix-a',
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:assemble',
      type: 'ASSEMBLE_TIMELINE',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: mappings.map((m) => m.primaryVisualTask).concat(['task:mix-a']),
      fallbackTaskId: null,
      profileScope: 'SHARED',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:render-vertical',
      type: 'RENDER_VERTICAL',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: ['task:assemble'],
      fallbackTaskId: null,
      profileScope: 'VERTICAL',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:render-landscape',
      type: 'RENDER_LANDSCAPE',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: ['task:assemble'],
      fallbackTaskId: null,
      profileScope: 'LANDSCAPE',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:mux',
      type: 'VALIDATE_ARTIFACT',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: ['task:render-vertical', 'task:render-landscape', 'task:mix-a'],
      fallbackTaskId: null,
      profileScope: 'DUAL',
      truthConstraints: ['C5', 'C6'],
    },
    {
      taskId: 'task:validate',
      type: 'VALIDATE_ARTIFACT',
      beatId: null,
      required: true,
      classification: 'REQUIRED',
      executeStatus: 'WAITING_FOR_DEPENDENCY',
      dependencies: ['task:mux'],
      fallbackTaskId: null,
      profileScope: 'DUAL',
      truthConstraints: ['C5', 'C6'],
    },
  ];

  const tasks = [...globalTasks.filter((t) => t.taskId.startsWith('task:frozen') || t.taskId.startsWith('task:accepted')), ...beatTasks, ...globalTasks.filter((t) => !t.taskId.startsWith('task:frozen') && !t.taskId.startsWith('task:accepted'))];
  const optional = tasks.filter((t) => !t.required);
  const critical = [
    'task:frozen-script',
    'task:accepted-narration',
    ...mappings.map((m) => m.primaryVisualTask),
    'task:fallback-cta',
    'task:mix-a',
    'task:assemble',
    'task:render-vertical',
    'task:render-landscape',
    'task:mux',
    'task:validate',
  ];

  return {
    schemaVersion: DIRECTOR_EXECUTION_MANIFEST_VERSION,
    manifestId: 'manifest:content-01:b2-15o2c:v1',
    tenantId: FROZEN_TENANT_ID,
    workspaceId: FROZEN_WORKSPACE_ID,
    projectId: FROZEN_PROJECT_ID,
    contentId: 'content-01',
    reviewSessionId: CONTENT_01_REVIEW_SESSION_ID,
    directorPlanRef: director.timelineId,
    scriptId: FROZEN_SCRIPT_ID,
    scriptVersion: FROZEN_SCRIPT_VERSION,
    narrationAssetRef: 'accepted-minimax-tts-content-01',
    narrationDurationMs: ACCEPTED_NARRATION_MS,
    plannedDurationMs: PLANNED_DURATION_MS,
    outputStrategy: 'DUAL_VERTICAL_AND_LANDSCAPE',
    authority: 'SCRIPT_IS_TIMELINE_AUTHORITY',
    status: 'EXECUTION_PREPARED' as const,
    createdAt: new Date().toISOString(),
    beats: mappings,
    tasks,
    dependencies: tasks.map((t) => ({ taskId: t.taskId, dependencies: t.dependencies })),
    providerReadiness: {
      screenRecording: 'READY',
      userImage: 'AVAILABLE',
      userVideo: 'EMPTY_LIBRARY',
      aiVideo: wanxiangVideoStatus(),
      aiImage: image.available,
      aiImageProvider: image.id,
      digitalHuman: 'BLOCKED_IDENTITY_ASSET',
      bgm: PRIMARY_BGM_PROVIDER,
      bgmTaskStatus,
      minimaxTtsConfigured: isMiniMaxTtsConfigured(),
    },
    creatorIdentityState: creatorIdentityRequirement(),
    bgmPlan: {
      decision: 'OPTIONAL',
      candidateCount: 1,
      mixA: 'NARRATION_ONLY',
      mixB: 'NARRATION_PLUS_BGM',
    },
    truthConstraints: ['C5', 'C6'],
    criticalPath: critical,
    optionalTaskIds: optional.map((t) => t.taskId),
    durationLock: { plannedMs: PLANNED_DURATION_MS, tolerance: DURATION_TOLERANCE, kind: 'DIRECTOR_PLANNED_DURATION' },
    humanApprovalObjectCreated: false,
    music,
    image,
  };
}

export function capabilityMatrix(manifest: ReturnType<typeof buildExecutionManifest>) {
  return {
    SCREEN_RECORDING: { status: 'READY', assetId: CONTENT_01_NEW_ASSET_ID },
    USER_IMAGE: { status: 'AVAILABLE' },
    USER_VIDEO: { status: 'EMPTY_LIBRARY' },
    AI_VIDEO: { provider: 'wanxiang-video:v1', status: manifest.providerReadiness.aiVideo },
    AI_IMAGE: { provider: manifest.providerReadiness.aiImageProvider, status: manifest.image.available },
    DIGITAL_HUMAN: { status: 'BLOCKED_IDENTITY_ASSET' },
    BGM: { provider: PRIMARY_BGM_PROVIDER, model: MINIMAX_MUSIC_MODEL, status: manifest.tasks.find((t) => t.type === 'GENERATE_BGM')?.executeStatus },
  };
}

export function lockedBgmBrief() {
  return {
    purpose: 'AI software demo background score',
    style: 'clean modern technology',
    energy: 'LOW_TO_MEDIUM',
    vocals: 'NONE',
    instrumental: true,
    narrationFriendly: true,
    targetDurationMs: PLANNED_DURATION_MS,
    structure: ['INTRO', 'STEADY', 'LIFT', 'OUTRO'],
    duckingRequired: true,
    truthConstraints: ['C5', 'C6'],
    endpoint: MINIMAX_MUSIC_OFFICIAL_URL,
    model: MINIMAX_MUSIC_MODEL,
    candidateCount: 1,
  };
}

export function minimaxMusicConfigAudit() {
  return {
    credentialEnvVariable: 'MINIMAX_TTS_API_KEY',
    ttsBaseUrlEnv: 'MINIMAX_TTS_BASE_URL',
    musicBaseUrlEnvOverride: 'MINIMAX_MUSIC_BASE_URL',
    musicModelDefault: MINIMAX_MUSIC_MODEL,
    musicEndpointDefault: MINIMAX_MUSIC_OFFICIAL_URL,
    httpClient: 'fetch',
    retryPolicy: 'NONE_SINGLE_ATTEMPT',
    timeoutMs: DEFAULT_MINIMAX_TIMEOUT_MS,
    errorMapping: 'sanitizeTtsError_redacts_secrets',
    secretRedaction: true,
    musicCallsThisStep: 0,
  };
}

export function productionTaskGraph(manifest: ReturnType<typeof buildExecutionManifest>) {
  return {
    schemaVersion: 'production.task-graph:v1',
    tasks: manifest.tasks.map((t) => ({
      taskId: t.taskId,
      type: t.type,
      required: t.required,
      dependencies: t.dependencies,
      fallbackTaskId: t.fallbackTaskId,
      profileScope: t.profileScope,
      executeStatus: t.executeStatus,
    })),
  };
}
