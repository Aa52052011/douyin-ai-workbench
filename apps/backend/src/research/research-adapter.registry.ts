import { Injectable } from '@nestjs/common';
import { DisabledMarketResearchAdapter } from './disabled-research.adapter.js';
import type { AdapterResearchRequest, MarketResearchSourceAdapter } from './research.types.js';

@Injectable()
export class MarketResearchAdapterRegistry {
  constructor(private readonly disabled: DisabledMarketResearchAdapter) {}

  /** Production never silently falls back to mock. */
  resolve(request: AdapterResearchRequest): MarketResearchSourceAdapter {
    void request;
    return this.disabled;
  }

  productionCapability(): { douyinAutonomousResearch: 'available' | 'notConfigured' } {
    return { douyinAutonomousResearch: this.disabled.getCapabilities().productionAvailable ? 'available' : 'notConfigured' };
  }
}
