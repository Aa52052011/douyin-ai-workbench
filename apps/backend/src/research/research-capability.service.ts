import { Injectable } from '@nestjs/common';
import { MarketResearchAdapterRegistry } from './research-adapter.registry.js';

@Injectable()
export class ResearchCapabilityService {
  constructor(private readonly registry: MarketResearchAdapterRegistry) {}

  getPublicCapability() {
    const cap = this.registry.productionCapability();
    return {
      douyinAutonomousResearch: cap.douyinAutonomousResearch,
    };
  }
}
