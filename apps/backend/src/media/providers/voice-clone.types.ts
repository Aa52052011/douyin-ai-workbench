export type VoiceCloneCapabilities = {
  clone: boolean;
  synthesize: boolean;
  remoteDelete: boolean;
  async: boolean;
};

export type VoiceCloneCreateInput = {
  profileId: string;
  sampleAssetId: string;
  language?: string;
};

export type VoiceCloneStatus = {
  providerVoiceId?: string;
  status: 'PENDING' | 'READY' | 'FAILED' | 'DISABLED';
};

export interface VoiceCloneProvider {
  readonly id: string;
  getCapabilities(): VoiceCloneCapabilities;
  createVoiceProfile(input: VoiceCloneCreateInput): Promise<VoiceCloneStatus>;
  getStatus(providerVoiceId: string): Promise<VoiceCloneStatus>;
  deleteVoice(providerVoiceId: string): Promise<{ deleted: boolean; remoteDelete: boolean }>;
}

export const VOICE_CLONE_PROVIDER = Symbol('VOICE_CLONE_PROVIDER');
