import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MarketDataProviderRegistry } from './market-provider.registry.js';
import { MarketImportConfirmService } from './market-import-confirm.service.js';
import { MarketImportController } from './market-import.controller.js';
import { MarketImportPreviewService } from './market-import-preview.service.js';
import { MarketEvidenceService } from './market-evidence.service.js';
import { MarketInsightsService } from './market-insights.service.js';
import { MarketResearchController } from './market-research.controller.js';
import { MarketResearchService } from './market-research.service.js';
import { ProductBriefsController } from './product-briefs.controller.js';
import { ProductBriefsService } from './product-briefs.service.js';
import { MARKET_DATA_PROVIDER_REGISTRY } from './market-provider.types.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule],
  controllers: [ProductBriefsController, MarketResearchController, MarketImportController],
  providers: [
    ProductBriefsService,
    MarketResearchService,
    MarketEvidenceService,
    MarketInsightsService,
    MarketImportPreviewService,
    MarketImportConfirmService,
    MarketDataProviderRegistry,
    {
      provide: MARKET_DATA_PROVIDER_REGISTRY,
      useExisting: MarketDataProviderRegistry,
    },
  ],
  exports: [
    ProductBriefsService,
    MarketResearchService,
    MarketInsightsService,
    MarketDataProviderRegistry,
    MARKET_DATA_PROVIDER_REGISTRY,
  ],
})
export class MarketModule {}
