import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { AccountMemoryController } from './account-memory.controller.js';
import { AccountMemoryService } from './account-memory.service.js';

@Module({
  imports: [AuthModule, AuthzModule, MetricsModule],
  controllers: [AccountMemoryController],
  providers: [AccountMemoryService],
  exports: [AccountMemoryService],
})
export class AccountMemoryModule {}
