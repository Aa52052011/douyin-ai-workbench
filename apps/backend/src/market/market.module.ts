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
import { ReferenceContentsController } from './reference-contents.controller.js';
import { ReferenceContentsService } from './reference-contents.service.js';
import { ReferenceIntelligenceService } from './reference-intelligence.service.js';
import { AccountMemoryModule } from '../memory/account-memory.module.js';
import { ResearchModule } from '../research/research.module.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule, AccountMemoryModule, ResearchModule],
  controllers: [
    ProductBriefsController,
    MarketResearchController,
    MarketImportController,
    ReferenceContentsController,
  ],
  providers: [
    ProductBriefsService,
    MarketResearchService,
    MarketEvidenceService,
    MarketInsightsService,
    MarketImportPreviewService,
    MarketImportConfirmService,
    ReferenceContentsService,
    ReferenceIntelligenceService,
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
    ReferenceContentsService,
    ReferenceIntelligenceService,
    MarketDataProviderRegistry,
    MARKET_DATA_PROVIDER_REGISTRY,
  ],
})
export class MarketModule {}
