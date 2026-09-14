import { Injectable } from '@nestjs/common';
import { DIGITAL_HUMAN_PROVIDER_MOCK } from '../dh/digital-human-config.js';
import type {
  AvatarStatus,
  DigitalHumanCapabilities,
  DigitalHumanGenerationRequest,
  DigitalHumanGenerationResult,
  DigitalHumanProvider,
  RegisterAvatarInput,
} from './digital-human.types.js';

/** Test fixture only. Never returns fake READY in production capability. */
@Injectable()
export class MockDigitalHumanProvider implements DigitalHumanProvider {
  readonly id = DIGITAL_HUMAN_PROVIDER_MOCK;

  getCapabilities(): DigitalHumanCapabilities {
    return { registerAvatar: true, generateTalkingVideo: true, remoteDelete: true, async: true };
  }

  async registerAvatar(input: RegisterAvatarInput): Promise<AvatarStatus> {
    return { providerAvatarId: `mock-avatar:${input.profileId}`, status: 'READY' };
  }

  async getAvatarStatus(providerAvatarId: string): Promise<AvatarStatus> {
    return { providerAvatarId, status: 'READY' };
  }

  async generateTalkingVideo(input: DigitalHumanGenerationRequest): Promise<DigitalHumanGenerationResult> {
    return {
      providerJobId: `mock-dh-job:${input.jobId}`,
      status: 'SUBMITTED',
      metadata: { async: true },
    };
  }

  async getGenerationStatus(providerJobId: string): Promise<DigitalHumanGenerationResult> {
    return { providerJobId, status: 'RUNNING' };
  }

  async cancelGeneration(_providerJobId: string): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  async deleteAvatar(_providerAvatarId: string): Promise<{ deleted: boolean; remoteDelete: boolean }> {
    return { deleted: true, remoteDelete: true };
  }
}
