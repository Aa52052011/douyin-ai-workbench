import type { EvidenceLevel } from './evidence-levels.js';

export type CandidateStatus =
  | 'PREFERRED_FOR_SMOKE_TEST'
  | 'BACKUP_FOR_SMOKE_TEST'
  | 'CANDIDATE'
  | 'NOT_SUITABLE'
  | 'UNVALIDATED';

export type VisionCandidateRow = {
  modelId: string;
  routerListed: EvidenceLevel;
  imageInput: EvidenceLevel;
  multiImage: EvidenceLevel;
  nativeTextReading: EvidenceLevel;
  structuredOutput: EvidenceLevel;
  jsonSchema: EvidenceLevel;
  jsonObject: EvidenceLevel;
  regionGrounding: EvidenceLevel;
  ChineseUIEvidence: EvidenceLevel;
  routerTransportEvidence: EvidenceLevel;
  costInfo: string;
  contextWindow: string;
  status: CandidateStatus;
  evidenceRefs: string[];
  notes: string[];
};

export const CATALOG_VISION_CANDIDATES: VisionCandidateRow[] = [
  {
    modelId: 'openai/gpt-5.5',
    routerListed: 'DOCUMENTED',
    imageInput: 'DOCUMENTED',
    multiImage: 'UNVALIDATED',
    nativeTextReading: 'UNVALIDATED',
    structuredOutput: 'INFERRED',
    jsonSchema: 'INFERRED',
    jsonObject: 'DOCUMENTED',
    regionGrounding: 'UNVALIDATED',
    ChineseUIEvidence: 'UNVALIDATED',
    routerTransportEvidence: 'DOCUMENTED',
    costInfo: 'Input $0.50 / 1M tokens; Output $2.25 / 1M tokens (catalog 2026-09-11)',
    contextWindow: '1.1M catalog / 1.05M detail page',
    status: 'PREFERRED_FOR_SMOKE_TEST',
    evidenceRefs: [
      'https://router.one/models.md',
      'https://router.one/models/gpt-5-5',
      'https://router.one/facts/api-compatibility.md',
      'https://router.one/gemini-api-china',
    ],
    notes: [
      'Catalog capabilities include vision. TEXT_ROUTE_CONFIRMED historically; not VISION_ROUTE_CONFIRMED.',
      'Detail page glance copy says text model; catalog vision flag remains source of truth.',
      'image_url is documented on the shared OpenAI-compatible endpoint (Gemini/Grok FAQs); GPT-native parts are the same wire format.',
      'Do not treat OpenRouter or other gateways as Router One proof.',
    ],
  },
  {
    modelId: 'google/gemini-3-flash',
    routerListed: 'DOCUMENTED',
    imageInput: 'DOCUMENTED',
    multiImage: 'UNVALIDATED',
    nativeTextReading: 'UNVALIDATED',
    structuredOutput: 'INFERRED',
    jsonSchema: 'INFERRED',
    jsonObject: 'DOCUMENTED',
    regionGrounding: 'UNVALIDATED',
    ChineseUIEvidence: 'UNVALIDATED',
    routerTransportEvidence: 'DOCUMENTED',
    costInfo: 'Input $0.1125 / 1M tokens; Output $0.675 / 1M tokens (catalog 2026-09-11)',
    contextWindow: '1.0M',
    status: 'CANDIDATE',
    evidenceRefs: ['https://router.one/models.md', 'https://router.one/gemini-api-china'],
    notes: [
      'Vision + image_url content parts documented on the Gemini China page for this endpoint family.',
      'Would require VISUAL_SEMANTIC_MODEL manual env later; not the configured text primary.',
    ],
  },
  {
    modelId: 'openai/gpt-5.6-terra',
    routerListed: 'DOCUMENTED',
    imageInput: 'DOCUMENTED',
    multiImage: 'UNVALIDATED',
    nativeTextReading: 'UNVALIDATED',
    structuredOutput: 'INFERRED',
    jsonSchema: 'INFERRED',
    jsonObject: 'DOCUMENTED',
    regionGrounding: 'UNVALIDATED',
    ChineseUIEvidence: 'UNVALIDATED',
    routerTransportEvidence: 'DOCUMENTED',
    costInfo: 'Input $0.25 / 1M tokens; Output $1.50 / 1M tokens (catalog 2026-09-11)',
    contextWindow: '1.1M',
    status: 'CANDIDATE',
    evidenceRefs: ['https://router.one/models.md'],
    notes: ['Catalog vision tag. Cheaper GPT-family vision option; not currently configured.'],
  },
  {
    modelId: 'anthropic/claude-haiku-4.5',
    routerListed: 'DOCUMENTED',
    imageInput: 'DOCUMENTED',
    multiImage: 'UNVALIDATED',
    nativeTextReading: 'UNVALIDATED',
    structuredOutput: 'INFERRED',
    jsonSchema: 'INFERRED',
    jsonObject: 'DOCUMENTED',
    regionGrounding: 'UNVALIDATED',
    ChineseUIEvidence: 'UNVALIDATED',
    routerTransportEvidence: 'INFERRED',
    costInfo: 'Input $0.30 / 1M tokens; Output $3.00 / 1M tokens (catalog 2026-09-11)',
    contextWindow: '200k',
    status: 'BACKUP_FOR_SMOKE_TEST',
    evidenceRefs: [
      'https://router.one/models.md',
      'https://router.one/models/claude-haiku-4-5',
      'https://router.one/facts/api-compatibility.md',
    ],
    notes: [
      'Selected as Vision backup because catalog+detail document image input — not because it is the text failover.',
      'Served on OpenAI chat/completions and Anthropic messages. Gateway does not advertise extra protocol translation.',
      'OpenAI image_url → Claude native image blocks on /v1/chat/completions is INFERRED.',
    ],
  },
  {
    modelId: 'grok-4.5',
    routerListed: 'DOCUMENTED',
    imageInput: 'DOCUMENTED',
    multiImage: 'UNVALIDATED',
    nativeTextReading: 'UNVALIDATED',
    structuredOutput: 'INFERRED',
    jsonSchema: 'INFERRED',
    jsonObject: 'DOCUMENTED',
    regionGrounding: 'UNVALIDATED',
    ChineseUIEvidence: 'UNVALIDATED',
    routerTransportEvidence: 'DOCUMENTED',
    costInfo: 'Input $0.80 / 1M tokens; Output $2.40 / 1M tokens (catalog 2026-09-11)',
    contextWindow: '500k',
    status: 'BACKUP_FOR_SMOKE_TEST',
    evidenceRefs: ['https://router.one/models.md', 'https://router.one/grok-api-china'],
    notes: [
      'Named in Grok FAQ as using standard image_url content parts.',
      'Alternate documented vision backup; first Vision backup remains haiku because image input is on the model detail page and the id is already in the text failover slot.',
    ],
  },
];
