import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { ScriptsController } from './scripts.controller.js';
import { ScriptsService } from './scripts.service.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule],
  controllers: [ScriptsController],
  providers: [ScriptsService],
})
export class ScriptsModule {}
