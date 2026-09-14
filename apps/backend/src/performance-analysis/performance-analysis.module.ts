import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { PerformanceAnalysisController } from './performance-analysis.controller.js';
import { PerformanceAnalysisService } from './performance-analysis.service.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [PerformanceAnalysisController],
  providers: [PerformanceAnalysisService],
  exports: [PerformanceAnalysisService],
})
export class PerformanceAnalysisModule {}
