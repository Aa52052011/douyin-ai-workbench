import { AUTONOMOUS_RESEARCH_NOT_CONFIGURED, type AdapterResearchRequest, type MarketResearchSourceAdapter } from './research.types.js';

export class DisabledMarketResearchAdapter implements MarketResearchSourceAdapter {
  getCapabilities() {
    return {
      id: 'disabled',
      adapterType: 'SYSTEM_INTERNAL' as const,
      platforms: ['douyin'],
      productionAvailable: false,
      sourcePolicy: 'none',
      dataRights: 'none',
      displayAllowed: false,
      analysisAllowed: false,
      retentionPolicy: 'no-collection',
    };
  }

  canHandle(_request: AdapterResearchRequest): boolean {
    return true;
  }

  async discover(_request: AdapterResearchRequest) {
    return { configured: false, code: AUTONOMOUS_RESEARCH_NOT_CONFIGURED, seeds: [], failures: [] };
  }

  async fetchEvidence(_request: AdapterResearchRequest) {
    return {
      configured: false,
      code: AUTONOMOUS_RESEARCH_NOT_CONFIGURED,
      evidence: [],
      failures: [{ source: 'douyin', reason: AUTONOMOUS_RESEARCH_NOT_CONFIGURED }],
    };
  }

  normalizeEvidence(): null {
    return null;
  }
}
