import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { AutonomousResearchService } from './autonomous-research.service.js';
import { DisabledMarketResearchAdapter } from './disabled-research.adapter.js';
import { LearningService } from './learning.service.js';
import { MarketResearchAdapterRegistry } from './research-adapter.registry.js';
import { ResearchCapabilityService } from './research-capability.service.js';
import { ResearchController } from './research.controller.js';

@Module({
  imports: [AuthModule, AuthzModule, MetricsModule],
  controllers: [ResearchController],
  providers: [
    DisabledMarketResearchAdapter,
    MarketResearchAdapterRegistry,
    ResearchCapabilityService,
    AutonomousResearchService,
    LearningService,
  ],
  exports: [AutonomousResearchService, LearningService, ResearchCapabilityService],
})
export class ResearchModule {}
