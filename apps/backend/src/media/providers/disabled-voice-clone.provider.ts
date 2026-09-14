import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { VOICE_CLONE_PROVIDER_DISABLED } from '../voice-clone/voice-clone-config.js';
import type { VoiceCloneCapabilities, VoiceCloneCreateInput, VoiceCloneProvider, VoiceCloneStatus } from './voice-clone.types.js';

@Injectable()
export class DisabledVoiceCloneProvider implements VoiceCloneProvider {
  readonly id = VOICE_CLONE_PROVIDER_DISABLED;

  getCapabilities(): VoiceCloneCapabilities {
    return { clone: false, synthesize: false, remoteDelete: false, async: false };
  }

  async createVoiceProfile(_input: VoiceCloneCreateInput): Promise<VoiceCloneStatus> {
    throw new AppError(ErrorCode.VOICE_CLONE_PROVIDER_NOT_CONFIGURED);
  }

  async getStatus(_providerVoiceId: string): Promise<VoiceCloneStatus> {
    throw new AppError(ErrorCode.VOICE_CLONE_PROVIDER_NOT_CONFIGURED);
  }

  async deleteVoice(_providerVoiceId: string): Promise<{ deleted: boolean; remoteDelete: boolean }> {
    throw new AppError(ErrorCode.VOICE_CLONE_PROVIDER_NOT_CONFIGURED);
  }
}
