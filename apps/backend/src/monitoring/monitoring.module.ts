import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
