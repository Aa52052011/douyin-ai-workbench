import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { ContentPlansController } from './content-plans.controller.js';
import { ContentPlansService } from './content-plans.service.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule],
  controllers: [ContentPlansController],
  providers: [ContentPlansService],
})
export class ContentPlansModule {}
