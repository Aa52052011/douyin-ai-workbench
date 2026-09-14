export function officialPublishResumeCriteriaV1() {
  return {
    schemaVersion: 'official.publish-resume-criteria:v1',
    productReadyForOfficialLaunch: false,
    formalWebsiteApp: false,
    publishCapabilityApproved: false,
    videoCreateBindAvailable: false,
    stableProductionDomain: false,
    oauthLiveValidated: false,
    uploadLiveValidated: false,
    createLiveValidated: false,
    publicationAuthorizationUxValidated: false,
    resumeAllowed: false,
    deferredReason: 'PRODUCT_STAGE_DECISION',
    not: ['TECHNICAL_FAILURE', 'CAPABILITY_REMOVED'],
  };
}

export function v1PublicationStrategy() {
  return {
    schemaVersion: 'v1.publication-strategy:v1',
    mode: 'MANUAL_EXPORT_ONLY' as const,
    officialPublish: 'DEFERRED_TO_POST_V1' as const,
    officialInfrastructure: 'PRESERVED' as const,
    liveApi: 'DISABLED' as const,
    automaticUpload: 'DISABLED_FOR_V1' as const,
    automaticCreate: 'DISABLED_FOR_V1' as const,
    automaticPublish: 'DISABLED_FOR_V1' as const,
    reason: 'PRODUCT_STAGE_DECISION',
    c5: 'RESTRICTED' as const,
    c6: 'RESTRICTED' as const,
    noQualityDowngrade: 'ACTIVE' as const,
    secretRotationRecommended: true,
    quickTunnel: 'NOT_REQUIRED_FOR_MAINLINE' as const,
    uiCopy: {
      primaryCta: '导出并手动发布',
      forbidden: ['自动发布成功', '一键发布到抖音'],
    },
  };
}

export function duplicatePostKey(input: { tenantId: string; platform: string; platformPostId: string }) {
  return `${input.tenantId}::${input.platform}::${input.platformPostId}`;
}

export function sameTenantRequired(authTenantId: string, rowTenantId: string): boolean {
  return authTenantId === rowTenantId;
}
