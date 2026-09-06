export type VideoProviderRequest = {
  requestId: string;
  storageKey: string;
  scriptId: string;
  targetDuration?: number;
  voiceStyle?: string;
  visualStyle?: string;
  aspectRatio?: string;
  resolution?: string;
  requirements?: string;
};

export type VideoProviderResult = {
  storageKey: string;
  size: number;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  originalFilename: string;
};

export interface VideoProvider {
  readonly id: string;
  render(request: VideoProviderRequest): Promise<VideoProviderResult>;
}
