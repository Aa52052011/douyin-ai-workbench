import type { EvidenceLevel } from './evidence-levels.js';

export type ClientCapabilityFlag = {
  supported: boolean;
  evidenceLevel: EvidenceLevel;
  notes: string;
};

export const EXISTING_PROVIDER_CAPABILITY_MAP = {
  textInput: {
    supported: true,
    evidenceLevel: 'CONFIRMED',
    notes: 'RealModelProvider POST OpenAI-compatible /v1/chat/completions with string message content.',
  },
  multimodalContentParts: {
    supported: false,
    evidenceLevel: 'CONFIRMED',
    notes: 'ModelMessage.content is string-only. Implementation gap, not a Router capability blocker.',
  },
  imageUrl: {
    supported: false,
    evidenceLevel: 'CONFIRMED',
    notes: 'No image_url parts in RealModelProvider body builder.',
  },
  dataUrl: {
    supported: false,
    evidenceLevel: 'CONFIRMED',
    notes: 'No data:image payload construction in chat client.',
  },
  multipleImages: {
    supported: false,
    evidenceLevel: 'CONFIRMED',
    notes: 'String content cannot carry 4–6 image parts.',
  },
  jsonObject: {
    supported: true,
    evidenceLevel: 'CONFIRMED',
    notes: 'response_format.type=json_object when request.responseFormat==="json".',
  },
  jsonSchema: {
    supported: false,
    evidenceLevel: 'CONFIRMED',
    notes: 'Client never sends response_format.type=json_schema.',
  },
  abortSignal: {
    supported: true,
    evidenceLevel: 'CONFIRMED',
    notes: 'AbortController + request.abortSignal + agent ALS combined.',
  },
  failover: {
    supported: true,
    evidenceLevel: 'CONFIRMED',
    notes: 'ModelRouter primary/backup circuit, timeouts, attemptKey metering.',
  },
  usageAccounting: {
    supported: true,
    evidenceLevel: 'CONFIRMED',
    notes: 'prompt_tokens/completion_tokens parsed; router meters LLM usage.',
  },
} as const satisfies Record<string, ClientCapabilityFlag>;
