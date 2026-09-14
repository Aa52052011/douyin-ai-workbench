export type DigitalHumanCapabilities = {
  registerAvatar: boolean;
  generateTalkingVideo: boolean;
  remoteDelete: boolean;
  async: boolean;
};

export type RegisterAvatarInput = {
  profileId: string;
  sourceAssetId: string;
  consentConfirmed: boolean;
};

export type AvatarStatus = {
  providerAvatarId?: string;
  status: 'PENDING' | 'READY' | 'FAILED' | 'DISABLED';
};

export type DigitalHumanGenerationRequest = {
  profileId: string;
  audioAssetId?: string;
  text?: string;
  voiceProfileId?: string;
  duration?: number;
  aspectRatio?: string;
  backgroundMode?: string;
  jobId: string;
  videoId: string;
  generationVersion: string;
};

export type DigitalHumanGenerationResult = {
  providerJobId: string;
  status: 'SUBMITTED' | 'RUNNING' | 'READY' | 'FAILED';
  outputAssetId?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
};

export interface DigitalHumanProvider {
  readonly id: string;
  getCapabilities(): DigitalHumanCapabilities;
  registerAvatar(input: RegisterAvatarInput): Promise<AvatarStatus>;
  getAvatarStatus(providerAvatarId: string): Promise<AvatarStatus>;
  generateTalkingVideo(input: DigitalHumanGenerationRequest): Promise<DigitalHumanGenerationResult>;
  getGenerationStatus(providerJobId: string): Promise<DigitalHumanGenerationResult>;
  cancelGeneration(providerJobId: string): Promise<{ cancelled: boolean }>;
  deleteAvatar(providerAvatarId: string): Promise<{ deleted: boolean; remoteDelete: boolean }>;
}

export const DIGITAL_HUMAN_PROVIDER = Symbol('DIGITAL_HUMAN_PROVIDER');
