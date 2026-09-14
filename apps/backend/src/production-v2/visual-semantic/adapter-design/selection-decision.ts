export const MODEL_SELECTION_CRITERIA = [
  'ChineseUI',
  'smallText',
  'browserChromeRecognition',
  'uiStructureGrounding',
  'multipleImageReasoning',
  'regionCoordinateQuality',
  'strictJsonReliability',
  'privacyTextObservation',
  'latency',
  'cost',
  'openaiCompatibleTransportFit',
  'availabilityStability',
] as const;

export const VALIDATION_STATES = ['CONFIRMED', 'UNVALIDATED', 'NOT_SUPPORTED', 'UNKNOWN'] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];

export const PROVIDER_SELECTION_STATES = [
  'PREFERRED_FOR_SMOKE_TEST',
  'BACKUP_FOR_SMOKE_TEST',
  'UNVALIDATED',
  'NOT_SUITABLE',
] as const;

export type VisionModelCandidate = {
  provider: string;
  model: string;
  multimodal: ValidationState;
  multiImage: ValidationState;
  structuredOutput: ValidationState;
  ChineseUI: ValidationState;
  smallText: ValidationState;
  regionGrounding: ValidationState;
  OCRLikeText: ValidationState;
  contextWindow: ValidationState;
  costKnown: ValidationState;
  latencyExpectation: ValidationState;
  transportFit: ValidationState;
  availabilityConfidence: ValidationState;
  notes: string;
  selectionState: (typeof PROVIDER_SELECTION_STATES)[number];
};

export const CANDIDATE_MODEL_MATRIX: VisionModelCandidate[] = [
  {
    provider: 'router-one-openai-compatible',
    model: 'openai/gpt-5.5',
    multimodal: 'UNVALIDATED',
    multiImage: 'UNVALIDATED',
    structuredOutput: 'UNVALIDATED',
    ChineseUI: 'UNVALIDATED',
    smallText: 'UNVALIDATED',
    regionGrounding: 'UNVALIDATED',
    OCRLikeText: 'UNVALIDATED',
    contextWindow: 'UNVALIDATED',
    costKnown: 'UNVALIDATED',
    latencyExpectation: 'UNVALIDATED',
    transportFit: 'CONFIRMED',
    availabilityConfidence: 'CONFIRMED',
    notes: 'Configured text-agent primary. RealModelProvider chat path CONFIRMED string-only. Vision image parts NOT in local contract. Do not assume name implies vision.',
    selectionState: 'PREFERRED_FOR_SMOKE_TEST',
  },
  {
    provider: 'router-one-openai-compatible',
    model: 'anthropic/claude-haiku-4.5',
    multimodal: 'UNVALIDATED',
    multiImage: 'UNVALIDATED',
    structuredOutput: 'UNVALIDATED',
    ChineseUI: 'UNVALIDATED',
    smallText: 'UNVALIDATED',
    regionGrounding: 'UNVALIDATED',
    OCRLikeText: 'UNVALIDATED',
    contextWindow: 'UNVALIDATED',
    costKnown: 'UNVALIDATED',
    latencyExpectation: 'UNVALIDATED',
    transportFit: 'CONFIRMED',
    availabilityConfidence: 'CONFIRMED',
    notes: 'Configured text-agent backup via MODEL_FALLBACK_1_NAME. Same string-only chat client. Vision capability UNVALIDATED.',
    selectionState: 'BACKUP_FOR_SMOKE_TEST',
  },
  {
    provider: 'router-one-openai-compatible',
    model: 'openai/gpt-5.4-mini',
    multimodal: 'UNVALIDATED',
    multiImage: 'UNVALIDATED',
    structuredOutput: 'UNVALIDATED',
    ChineseUI: 'UNVALIDATED',
    smallText: 'UNVALIDATED',
    regionGrounding: 'UNVALIDATED',
    OCRLikeText: 'UNVALIDATED',
    contextWindow: 'UNVALIDATED',
    costKnown: 'UNVALIDATED',
    latencyExpectation: 'UNVALIDATED',
    transportFit: 'CONFIRMED',
    availabilityConfidence: 'UNVALIDATED',
    notes: 'Appears only in .env.example as sample MODEL_NAME. Not treated as production vision proof.',
    selectionState: 'UNVALIDATED',
  },
];

export const VISION_PROVIDER_SELECTION_DECISION = {
  recommendedPath: 'REUSE_EXISTING_ROUTER_ONE_HTTP_AFTER_MULTIMODAL_PROOF',
  primaryCandidate: 'UNVALIDATED',
  backupCandidate: 'UNVALIDATED',
  configuredTextPrimary: 'openai/gpt-5.5',
  configuredTextBackup: 'anthropic/claude-haiku-4.5',
  why: [
    'Reuse fetch + AbortSignal + failover + usage attemptKey rather than a new HTTP stack.',
    'Current RealModelProvider messages.content is string; multimodal parts require a new transport, not a text-path patch.',
    'No local test or vendor doc artifact confirms image input for configured models or Router One forwarding.',
  ],
  validatedFacts: [
    'OpenAI-compatible POST /v1/chat/completions exists in RealModelProvider',
    'json_object response_format exists; json_schema native structured output does not',
    'Failover circuit + primary/backup timeouts exist for text LLM',
    'MODEL_PROVIDER real|router-one share the same client',
  ],
  unvalidatedAssumptions: [
    'Configured models accept image_url / image parts',
    'Router One forwards multimodal payloads without stripping parts',
    '6x 1280 JPEG request size is accepted',
    'Chinese small-text UI observation quality',
  ],
  blockingUnknowns: [
    'CURRENT_MODEL_VISION_CAPABILITY',
    'ROUTER_ONE_MULTIMODAL_FORWARDING',
    'MULTI_IMAGE_PER_REQUEST',
  ],
  smokeTestRequirements: [
    'Documentation or vendor capability list for image chat',
    'Synthetic single-image fixture through new transport only',
    'Schema pass without decision leakage',
  ],
  status: 'BLOCKED_BY_CAPABILITY_UNKNOWN' as const,
};

export const OCR_MVP_DECISION = {
  dedicatedOcr: 'NOT_REQUIRED_YET' as const,
  nativeTextReading: 'DESIGNED_AS_SEPARATE_CAPABILITY' as const,
  rationale: 'First prove Vision native text on Chinese UI / localhost / labels. Add OCR only if native text fails.',
};
