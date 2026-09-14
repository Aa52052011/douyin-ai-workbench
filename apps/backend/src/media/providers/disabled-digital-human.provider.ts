import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { DIGITAL_HUMAN_PROVIDER_DISABLED } from '../dh/digital-human-config.js';
import type {
  AvatarStatus,
  DigitalHumanCapabilities,
  DigitalHumanGenerationRequest,
  DigitalHumanGenerationResult,
  DigitalHumanProvider,
  RegisterAvatarInput,
} from './digital-human.types.js';

@Injectable()
export class DisabledDigitalHumanProvider implements DigitalHumanProvider {
  readonly id = DIGITAL_HUMAN_PROVIDER_DISABLED;

  getCapabilities(): DigitalHumanCapabilities {
    return { registerAvatar: false, generateTalkingVideo: false, remoteDelete: false, async: true };
  }

  async registerAvatar(_input: RegisterAvatarInput): Promise<AvatarStatus> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }

  async getAvatarStatus(_providerAvatarId: string): Promise<AvatarStatus> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }

  async generateTalkingVideo(_input: DigitalHumanGenerationRequest): Promise<DigitalHumanGenerationResult> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }

  async getGenerationStatus(_providerJobId: string): Promise<DigitalHumanGenerationResult> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }

  async cancelGeneration(_providerJobId: string): Promise<{ cancelled: boolean }> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }

  async deleteAvatar(_providerAvatarId: string): Promise<{ deleted: boolean; remoteDelete: boolean }> {
    throw new AppError(ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
  }
}
