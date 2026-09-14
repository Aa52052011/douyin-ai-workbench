import { FROZEN_SCRIPT_ID } from '../audio-calibration/audio-integration.js';
import { evaluateFinalTruthGate } from '../source-aware-output/final-readiness.js';
import { productionConstraintRegistry } from './production-constraints.js';
import { FINAL_PRODUCTION_SPEC_ID } from './final-production-spec-v2.js';
import {
  FINAL_PRODUCTION_AUTHORIZATION_V2_ID,
  FINAL_REVIEW_SESSION_V2_ID,
  FROZEN_CONSTRAINT_SNAPSHOT_HASH_V2,
  FROZEN_SPEC_HASH_V2,
  LANDSCAPE_ARTIFACT_V2_ID,
  PRODUCTION_EXECUTION_PLAN_V2_ID,
  VERTICAL_ARTIFACT_V2_ID,
} from './final-production-v2-authorization.js';

export const ACCEPTED_VERTICAL_SHA_V2 =
  'fb742cb2471844ff8a4c7c2a500400c5c551973f9daf25adf0c238ca51688f7f';
export const ACCEPTED_LANDSCAPE_SHA_V2 =
  '966b501d40ed97d82c8f5f1887274d3caafe6f7905c6187869c74044c02efd00';
export const FINAL_PRODUCTION_ACCEPTANCE_V2_ID = '9dbda6b5-1504-4000-8c22-fb742cb24718';
export const ACCEPTED_AT_V2 = '2026-09-13T06:32:00.000Z';

export const VERTICAL_V2_RELATIVE_PATH =
  '.local/production-artifacts/01a08b3f-9638-7fd1-a1ee-344682fb4809/01b2151503-final-v2/vertical.douyin.v2.mp4';
export const LANDSCAPE_V2_RELATIVE_PATH =
  '.local/production-artifacts/01a08b3f-9638-7fd1-a1ee-344682fb4809/01b2151503-final-v2/landscape.ui-demo.v2.mp4';

void FROZEN_SCRIPT_ID;

export type ReadinessVocabV1 =
  | 'READY'
  | 'NOT_READY'
  | 'BLOCKED_CONFIG'
  | 'BLOCKED_ACCOUNT'
  | 'BLOCKED_HUMAN_APPROVAL'
  | 'NOT_IMPLEMENTED'
  | 'NOT_APPLICABLE';

export function publicationAuthorizationContract() {
  return {
    schemaVersion: 'publication.authorization:v1',
    requiredFields: [
      'authorizationId',
      'projectId',
      'artifactId',
      'platform',
      'accountId',
      'captionHash',
      'coverHash',
      'publishSettingsHash',
      'scheduledAt',
      'source',
      'actor',
      'authorizedAt',
      'status',
    ],
    allowedSources: ['EXPLICIT_USER_MESSAGE', 'EXPLICIT_UI_HUMAN_ACTION'],
    forbiddenInferences: ['CONTINUE', 'ALREADY_ACCEPTED', 'PREPARE_TO_PUBLISH'],
    thisStepCreatesInstance: false,
  };
}

export function publicationCopyContract() {
  return {
    schemaVersion: 'publication.copy:v1',
    requiredFields: ['title', 'caption', 'hashtags', 'topics', 'cta', 'truthConstraints', 'source', 'status'],
    frozenScriptIsNotCaption: true,
  };
}

export function publicationCopyDraft() {
  return {
    schemaVersion: 'publication.copy:v1',
    title: '先不看成片：抖音AI智能工作台到底是什么？',
    caption:
      '用自己的抖音内容实测一套AI短视频工作台：选题、策略、脚本和制作在一条流程里。成片仍要人工审核口播、字幕和画面，然后手动发布。不预设爆款，只看证据。你最想测哪个环节？',
    hashtags: ['AI短视频工作台', '产品实测', '内容生产', '人工审核'],
    topics: ['产品实测', '短视频工作流'],
    cta: '留言告诉我你最想测哪个环节',
    truthConstraints: ['C5', 'C6'] as Array<'C5' | 'C6'>,
    source: 'DETERMINISTIC_DRAFT_FROM_FROZEN_SEMANTICS',
    status: 'DRAFT' as const,
    autoApproved: false,
    notFullNarrationScript: true,
    llmCalls: 0,
  };
}

export function coverPreparationContract() {
  return {
    schemaVersion: 'cover.preparation:v1',
    requiredFields: [
      'coverId',
      'sourceArtifactRef',
      'frameTimestamp',
      'cropPolicy',
      'textOverlay',
      'visualPolicy',
      'truthConstraints',
      'status',
    ],
    visualPolicy: 'PRODUCT_VISUAL_LANGUAGE_IS_PRIMARY',
    forbidden: ['TROPHY', 'GOLD_COIN', 'HYPER_GROWTH_ARROW', 'AD_POSTER', 'REJECTED_AI_IMAGE'],
    independentHumanReviewRequired: true,
  };
}

export function publicationSettingsContract() {
  return {
    schemaVersion: 'publication.settings:v1',
    requiredFields: [
      'platform',
      'visibility',
      'allowComments',
      'allowDuet',
      'allowDownload',
      'contentDeclaration',
      'scheduledAt',
      'publishMode',
    ],
    defaultsAreNotApproval: true,
  };
}

export function publicationSettingsDraft() {
  return {
    platform: 'DOUYIN',
    visibility: 'PUBLIC',
    allowComments: true,
    allowDuet: null,
    allowDownload: null,
    contentDeclaration: null,
    scheduledAt: null,
    publishMode: 'MANUAL_EXPORT_ONLY',
    defaultsAreNotApproval: true,
    humanApproval: 'PENDING' as const,
    status: 'NOT_PREPARED' as const,
  };
}

export function publicationResultContract() {
  return {
    schemaVersion: 'publication.result:v1',
    requiredFields: [
      'publicationId',
      'platform',
      'accountId',
      'artifactId',
      'postId',
      'publishedAt',
      'status',
      'url',
      'providerResponseRef',
    ],
    thisStepCreatesInstance: false,
    futureLinks: ['data monitoring', 'performance metrics', 'comments', 'AI reply', 'content optimization loop'],
  };
}

export function buildFinalProductionAcceptanceV2() {
  const truth = evaluateFinalTruthGate();
  return {
    schemaVersion: 'final.production-acceptance:v2',
    acceptanceId: FINAL_PRODUCTION_ACCEPTANCE_V2_ID,
    reviewSessionId: FINAL_REVIEW_SESSION_V2_ID,
    productionExecutionPlanId: PRODUCTION_EXECUTION_PLAN_V2_ID,
    productionAuthorizationId: FINAL_PRODUCTION_AUTHORIZATION_V2_ID,
    specificationId: FINAL_PRODUCTION_SPEC_ID,
    specificationHash: FROZEN_SPEC_HASH_V2,
    source: 'EXPLICIT_USER_MESSAGE' as const,
    actor: 'HUMAN_USER' as const,
    decision: 'ACCEPTED' as const,
    acceptedAt: ACCEPTED_AT_V2,
    verticalArtifactId: VERTICAL_ARTIFACT_V2_ID,
    verticalSHA256: ACCEPTED_VERTICAL_SHA_V2,
    landscapeArtifactId: LANDSCAPE_ARTIFACT_V2_ID,
    landscapeSHA256: ACCEPTED_LANDSCAPE_SHA_V2,
    constraintSnapshotHash: FROZEN_CONSTRAINT_SNAPSHOT_HASH_V2,
    truthGateStatus: truth.result,
    notes:
      'Accepts current Vertical V2 and Landscape V2 as final production artifacts. Does not grant publication, scheduling, caption, cover, account, or privacy approvals.',
    immutable: true,
    appendOnly: true,
    doesNotEqual: 'PUBLICATION_AUTHORIZATION',
  };
}

export function finalProductionAcceptanceEvent() {
  return {
    schemaVersion: 'final.production-acceptance-event:v1',
    event: 'ACCEPT_FINAL_PRODUCTION',
    source: 'EXPLICIT_USER_MESSAGE',
    actor: 'HUMAN_USER',
    at: ACCEPTED_AT_V2,
    acceptanceId: FINAL_PRODUCTION_ACCEPTANCE_V2_ID,
    reviewSessionId: FINAL_REVIEW_SESSION_V2_ID,
  };
}

export function reviewSessionAcceptedHistory() {
  return {
    sessionId: FINAL_REVIEW_SESSION_V2_ID,
    humanDecision: 'ACCEPTED',
    acceptanceSource: 'EXPLICIT_USER_MESSAGE',
    history: [
      { status: 'READY_FOR_HUMAN_REVIEW', step: 'B2-15O3' },
      { status: 'ACCEPTED', step: 'B2-15O4', event: 'ACCEPT_FINAL_PRODUCTION' },
    ],
  };
}

export function publicationTruthGate(draft = publicationCopyDraft()) {
  const caption = `${draft.title}\n${draft.caption}\n${draft.hashtags.join(' ')}`;
  const growth = /保证爆款|保证增长|保证收益|必然成功/;
  const auto = /已经全自动发布|无人值守自动发布已经真实完成/;
  return {
    schemaVersion: 'publication.truth-gate:v1',
    status: 'PASS_WITH_RESTRICTIONS' as const,
    C5: 'RESTRICTED',
    C6: 'RESTRICTED',
    captionClaim: growth.test(caption) ? 'FAIL' : 'PASS',
    coverClaim: 'NOT_PREPARED',
    hashtagsImplication: growth.test(draft.hashtags.join('')) ? 'FAIL' : 'PASS',
    publishModeClaim: auto.test(caption) ? 'FAIL' : 'PASS',
    automationClaim: 'MANUAL_EXPORT_ONLY_STATED',
    videoAcceptanceDoesNotUnlockTruth: true,
  };
}

export function auditDouyinPublishCapability(input: {
  oauthConfigured: boolean;
  douyinAccountCount: number;
  douyinActiveAccountCount: number;
}) {
  return {
    oauthConnectorImplemented: true,
    oauthConfigured: input.oauthConfigured,
    oauthLiveValidated: false,
    accountConnected: input.douyinActiveAccountCount > 0,
    douyinAccountCount: input.douyinAccountCount,
    douyinActiveAccountCount: input.douyinActiveAccountCount,
    publishProviderImplemented: false,
    publishProviderConfigured: false,
    publishProviderAuthenticated: false,
    publishProviderLiveValidated: false,
    mockPublishOnly: true,
    publishMode: 'MANUAL_EXPORT_ONLY' as const,
    uiButtonDoesNotMeanAutoPublishReady: true,
  };
}

export function publicationCapabilityLedger(audit: ReturnType<typeof auditDouyinPublishCapability>) {
  return {
    schemaVersion: 'publication.capability-ledger:v1',
    items: [
      {
        capability: 'DOUYIN_ACCOUNT_CONNECTOR',
        status: audit.oauthConfigured ? 'IMPLEMENTED_CONFIG_PRESENT' : 'IMPLEMENTED_NOT_CONFIGURED',
        provider: 'douyin.oauth',
        configurationRequired: !audit.oauthConfigured,
        humanActionRequired: !audit.accountConnected,
      },
      {
        capability: 'DOUYIN_UPLOAD',
        status: 'NOT_IMPLEMENTED',
        provider: null,
        configurationRequired: true,
        humanActionRequired: false,
      },
      {
        capability: 'DOUYIN_PUBLISH',
        status: 'NOT_IMPLEMENTED',
        provider: null,
        note: 'PublishingProviderRegistry resolves MOCK only; Platform.DOUYIN throws PUBLISHING_PROVIDER_NOT_IMPLEMENTED',
        configurationRequired: true,
        humanActionRequired: false,
      },
      {
        capability: 'DOUYIN_SCHEDULE',
        status: 'NOT_IMPLEMENTED',
        provider: null,
        configurationRequired: true,
        humanActionRequired: false,
      },
      {
        capability: 'DOUYIN_STATUS_MONITORING',
        status: 'MOCK_ONLY',
        provider: 'mock-publishing',
        configurationRequired: true,
        humanActionRequired: false,
      },
      {
        capability: 'DOUYIN_METRICS_PULL',
        status: 'MANUAL_IMPORT_ONLY',
        provider: 'publication-metrics-manual / export mapping',
        configurationRequired: false,
        humanActionRequired: true,
      },
    ],
  };
}

export function publicationReadinessMatrix(audit: ReturnType<typeof auditDouyinPublishCapability>) {
  return {
    schemaVersion: 'publication.readiness-matrix:v1',
    FINAL_VIDEO_ACCEPTED: 'READY' as ReadinessVocabV1,
    VERTICAL_ARTIFACT_VALID: 'READY' as ReadinessVocabV1,
    ACCOUNT_CONNECTED: audit.accountConnected ? ('READY' as ReadinessVocabV1) : ('BLOCKED_ACCOUNT' as ReadinessVocabV1),
    PUBLISH_PROVIDER_IMPLEMENTED: 'NOT_IMPLEMENTED' as ReadinessVocabV1,
    PUBLISH_PROVIDER_CONFIGURED: 'NOT_IMPLEMENTED' as ReadinessVocabV1,
    PUBLISH_PROVIDER_AUTHENTICATED: 'NOT_IMPLEMENTED' as ReadinessVocabV1,
    CAPTION_PREPARED: 'NOT_READY' as ReadinessVocabV1,
    CAPTION_HUMAN_APPROVED: 'BLOCKED_HUMAN_APPROVAL' as ReadinessVocabV1,
    COVER_PREPARED: 'NOT_READY' as ReadinessVocabV1,
    COVER_HUMAN_APPROVED: 'BLOCKED_HUMAN_APPROVAL' as ReadinessVocabV1,
    SETTINGS_PREPARED: 'NOT_READY' as ReadinessVocabV1,
    SETTINGS_HUMAN_APPROVED: 'BLOCKED_HUMAN_APPROVAL' as ReadinessVocabV1,
    C5_COMPLIANT: 'READY' as ReadinessVocabV1,
    C6_COMPLIANT: 'READY' as ReadinessVocabV1,
    PUBLICATION_AUTHORIZATION: 'BLOCKED_HUMAN_APPROVAL' as ReadinessVocabV1,
  };
}

export function recommendedPublicationNextStep(audit: ReturnType<typeof auditDouyinPublishCapability>) {
  if (!audit.publishProviderImplemented) return 'IMPLEMENT_DOUYIN_PUBLISH_PROVIDER';
  if (!audit.accountConnected) return 'CONNECT_DOUYIN_ACCOUNT';
  return 'HUMAN_REVIEW_PUBLICATION_METADATA';
}

export function acceptanceStaleIfShaChanges(currentVerticalSha: string, currentLandscapeSha: string): boolean {
  return currentVerticalSha !== ACCEPTED_VERTICAL_SHA_V2 || currentLandscapeSha !== ACCEPTED_LANDSCAPE_SHA_V2;
}

void productionConstraintRegistry;
void publicationAuthorizationContract;
void publicationCopyContract;
void coverPreparationContract;
void publicationSettingsContract;
void publicationResultContract;
void publicationSettingsDraft;
void recommendedPublicationNextStep;
