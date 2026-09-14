export const PROVIDER_IMAGE_TRANSPORTS = ['DATA_URL', 'BINARY_UPLOAD', 'SIGNED_URL', 'PROVIDER_FILE_ID'] as const;
export type ProviderImageTransport = (typeof PROVIDER_IMAGE_TRANSPORTS)[number];

export type ProviderImageInput = {
  frameId: string;
  timestampMs?: number;
  selectionReasons?: string[];
  mimeType: 'image/jpeg' | 'image/png';
  transport: ProviderImageTransport;
  /** Never a Windows filesystem path. */
  payloadRef: string;
};

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_ref'; image: ProviderImageInput };

export type MultimodalMessage = {
  role: 'system' | 'user' | 'assistant';
  parts: MultimodalContentPart[];
};

export type MultimodalModelRequest = {
  model: string;
  requestId: string;
  messages: MultimodalMessage[];
  images: ProviderImageInput[];
  responseSchema: 'visual.semantic.provider-result:v1';
  temperature?: number;
  timeoutMs: number;
};

export type MultimodalInvokeOptions = {
  timeoutMs: number;
  abortSignal?: AbortSignal;
  routeRole?: 'primary' | 'backup';
  attemptKey?: string;
};

export type MultimodalModelClient = {
  invoke(request: MultimodalModelRequest, options: MultimodalInvokeOptions): Promise<{
    rawText: string;
    usage?: {
      inputTextUnits?: number | null;
      inputImageUnits?: number | null;
      outputUnits?: number | null;
      cost?: number | null;
      costStatus: 'PRICED' | 'UNPRICED';
    };
  }>;
};

export const LOCAL_REF_HANDOFF = {
  scopedOnly: true,
  convertBeforeRemote: true,
  forbidden: ['WINDOWS_PATH', 'UNC_PATH', 'FILE_URL_TO_PUBLIC_CDN'],
} as const;
