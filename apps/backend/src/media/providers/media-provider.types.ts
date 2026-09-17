export type TtsUsage = {
  inputCharacters?: number;
  audioSeconds?: number;
  audioSecondsExact?: number;
  provider?: string;
  model?: string;
  estimatedCost?: number;
  currency?: string;
  providerDurationMs?: number;
};

export type TtsSynthesizeRequest = {
  text: string;
  storageKey: string;
  voice?: string;
  language?: string;
  speed?: number;
  clientRequestId?: string;
};

export type SpeechTimingCue = {
  text: string;
  start: number;
  end: number;
};

export type TtsSynthesizeResult = {
  storageKey: string;
  duration: number;
  mimeType: string;
  size: number;
  usage?: TtsUsage;
  speechCues?: SpeechTimingCue[];
  timingSource?: 'provider_sentence' | 'provider_word' | 'none';
};

export interface TtsProvider {
  readonly id: string;
  readonly capabilities?: { tts: boolean; async?: boolean };
  synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}

export type ImageUsage = {
  provider: string;
  model?: string;
  imageCount?: number;
  providerTaskId?: string;
  providerDurationMs?: number;
};

export type ImageGenerateRequest = {
  sceneId: string;
  sequence: number;
  prompt: string;
  storageKey: string;
  clientRequestId: string;
  negativePrompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  style?: string;
};

export type ImageGenerateResult = {
  storageKey: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  provider: string;
  model?: string;
  usage?: ImageUsage;
  providerTaskId?: string;
};

export interface ImageProvider {
  readonly id: string;
  readonly model?: string;
  readonly capabilities?: { image: true; async?: boolean; idempotency?: boolean; taskLookup?: boolean };
  generate(request: ImageGenerateRequest): Promise<ImageGenerateResult>;
}

export interface SubtitleProvider {
  readonly id: string;
  render(request: {
    cues: Array<{ start: number; end: number; text: string }>;
    storageKey: string;
    clientRequestId?: string;
  }): Promise<{ storageKey: string; mimeType: string; size: number; body: string }>;
}

export type ComposeSceneInput = {
  storageKey: string;
  durationBudget: number;
  mimeType?: string;
  kind?: 'image' | 'video';
  sourceStartSec?: number;
  freezePadSec?: number;
  cropTopRatio?: number;
};

export type ComposeRequest = {
  storageKey: string;
  voiceDuration: number;
  targetDuration: number;
  sceneCount: number;
  clientRequestId?: string;
  failToken?: string;
  resolution?: string;
  aspectRatio?: string;
  fps?: number;
  scenes?: ComposeSceneInput[];
  voiceStorageKey?: string;
  voiceMimeType?: string;
  subtitleStorageKey?: string;
};

export type ComposeResult = {
  storageKey: string;
  duration: number;
  width: number;
  height: number;
  mimeType: string;
  size: number;
};

export interface ComposeProvider {
  readonly id: string;
  readonly capabilities?: { compose: boolean; async?: boolean };
  compose(request: ComposeRequest): Promise<ComposeResult>;
}
