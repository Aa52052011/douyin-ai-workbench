export type TextContentPart = {
  type: 'text';
  text: string;
};

export type ImageContentPart = {
  type: 'image_url';
  image_url: { url: string };
};

export type MultimodalContentPart = TextContentPart | ImageContentPart;

export type MultimodalMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | MultimodalContentPart[];
};

export type MultimodalInvokeInput = {
  model: string;
  messages: MultimodalMessage[];
  images: ImageContentPart[];
  responseFormat: 'json_object';
  requestId: string;
  maxTokens?: number;
};

export type MultimodalInvokeOptions = {
  timeoutMs: number;
  abortSignal?: AbortSignal;
};

export type MultimodalUsage = {
  inputTextUnits: number | null;
  inputImageUnits: number | null;
  outputUnits: number | null;
  totalUnits: number | null;
  cost: number | null;
  costStatus: 'PRICED' | 'UNPRICED';
};

export type MultimodalInvokeResult = {
  rawText: string;
  latencyMs: number;
  httpStatus: number;
  usage: MultimodalUsage;
  finishReason: string | null;
};

export type MultimodalModelClient = {
  invoke(input: MultimodalInvokeInput, options: MultimodalInvokeOptions): Promise<MultimodalInvokeResult>;
};

export const VISION_SMOKE_TIMEOUT_MS = 90_000;
export const VISION_MULTI_3_TIMEOUT_MS = 120_000;
export const VISION_MULTI_6_TIMEOUT_MS = 150_000;
export const FROZEN_SMOKE_MODEL = 'openai/gpt-5.5';
export const SYNTHETIC_FRAME_ID = 'synthetic-ui-0';
export const SMOKE_INFERENCE_LIMIT = 1;
export const BENCHMARK_INFERENCE_LIMIT = 3;
export const MAX_BENCHMARK_IMAGES = 6;
export const MAX_OBSERVATIONS_PER_FRAME = 10;
export const REAL_CONTENT_INFERENCE_LIMIT = 2;
export const REAL_CONTENT_CALL_A_TIMEOUT_MS = 150_000;
export const REAL_CONTENT_CALL_B_TIMEOUT_MS = 120_000;
export const TEXT_EVIDENCE_ONLY_MAX_FRAMES = 3;
export const B2_6B_INFERENCE_LIMIT = 1;
export const B2_6B_CALL_A_TIMEOUT_MS = 120_000;
export const REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED = 'REAL_CONTENT_VISION_INFERENCE_LIMIT_EXCEEDED';
export const SMOKE_INFERENCE_LIMIT_EXCEEDED = 'SMOKE_INFERENCE_LIMIT_EXCEEDED';
