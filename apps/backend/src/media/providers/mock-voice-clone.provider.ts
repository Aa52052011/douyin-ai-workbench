import { Injectable } from '@nestjs/common';
import { VOICE_CLONE_PROVIDER_MOCK } from '../voice-clone/voice-clone-config.js';
import type { VoiceCloneCapabilities, VoiceCloneCreateInput, VoiceCloneProvider, VoiceCloneStatus } from './voice-clone.types.js';

/** Test/dev fixture only. Never flips production VOICE_CLONE capability. */
@Injectable()
export class MockVoiceCloneProvider implements VoiceCloneProvider {
  readonly id = VOICE_CLONE_PROVIDER_MOCK;

  getCapabilities(): VoiceCloneCapabilities {
    return { clone: true, synthesize: false, remoteDelete: true, async: false };
  }

  async createVoiceProfile(input: VoiceCloneCreateInput): Promise<VoiceCloneStatus> {
    return { providerVoiceId: `mock-voice:${input.profileId}`, status: 'READY' };
  }

  async getStatus(providerVoiceId: string): Promise<VoiceCloneStatus> {
    return { providerVoiceId, status: 'READY' };
  }

  async deleteVoice(_providerVoiceId: string): Promise<{ deleted: boolean; remoteDelete: boolean }> {
    return { deleted: true, remoteDelete: true };
  }
}
