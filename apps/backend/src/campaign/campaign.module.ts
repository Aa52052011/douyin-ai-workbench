import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MarketModule } from '../market/market.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { CampaignStrategyInputComposer } from './campaign-strategy-input.composer.js';
import { CampaignStrategyController } from './campaign-strategy.controller.js';
import { CampaignStrategyService } from './campaign-strategy.service.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule, MarketModule, MetricsModule],
  controllers: [CampaignStrategyController],
  providers: [CampaignStrategyInputComposer, CampaignStrategyService],
  exports: [CampaignStrategyService, CampaignStrategyInputComposer],
})
export class CampaignModule {}
