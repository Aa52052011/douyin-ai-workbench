export const FIRST_SMOKE_TEST_CONTRACT = {
  enabledWhen: 'READY_FOR_SMOKE_TEST',
  imageCount: 1,
  imageSource: 'SYNTHETIC_FIXTURE_ONLY',
  forbiddenSources: ['CONTENT_01_FRAMES', 'USER_UPLOAD', 'PRODUCTION_RECORDING'],
  modules: ['UI_STRUCTURE'] as const,
  excludedModules: ['PRIVACY', 'AUTHENTICITY', 'WATERMARK', 'PROJECT_CONTEXT'] as const,
  groundTruth: {
    kind: 'product_style_ui',
    hasTopNavigation: true,
    hasContentRegion: true,
    hasButtons: true,
    hasBrowserChrome: false,
    productHeaderTrap: 'MUST_NOT_CLASSIFY_PRODUCT_HEADER_AS_BROWSER_CHROME',
  },
  payload: {
    format: 'openai_image_url_content_parts',
    preferredUrlKind: 'DATA_URL',
    dataUrlRouterEvidence: 'UNVALIDATED',
    note: 'First call validates auth, acceptance, schema, latency, error mapping — not semantic quality.',
  },
  followOn: ['single_image_smoke', 'then_3_images', 'then_6_content01_frames'],
} as const;

export const HIDDEN_VISION_CODE_AUDIT = {
  productionChatImageUrl: false,
  productionInputImage: false,
  visualSemanticImageParts: false,
  wanxIsImageGenerationNotVisionAnalysis: true,
  adapterDesignTypesOnly: true,
  reusableRuntimeVisionClient: false,
} as const;

export const DEPENDENCY_AUDIT = {
  openaiSdkInstalled: false,
  anthropicSdkInstalled: false,
  newPackagesInstalledThisStep: false,
  existingHttpClient: 'fetch in RealModelProvider',
  multimodalTypesInExistingSdk: 'N/A_NO_OPENAI_PACKAGE',
} as const;
