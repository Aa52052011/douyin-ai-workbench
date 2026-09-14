import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { DigitalHumanProfilesController } from './digital-human-profiles.controller.js';
import { DigitalHumanProfilesService } from './digital-human-profiles.service.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [DigitalHumanProfilesController],
  providers: [DigitalHumanProfilesService],
  exports: [DigitalHumanProfilesService],
})
export class DigitalHumanModule {}
