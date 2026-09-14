import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MediaCapabilitiesController } from './media-capabilities.controller.js';
import { VoiceProfilesController } from './voice-profiles.controller.js';
import { VoiceProfilesService } from './voice-profiles.service.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [VoiceProfilesController, MediaCapabilitiesController],
  providers: [VoiceProfilesService],
  exports: [VoiceProfilesService],
})
export class VoiceModule {}
