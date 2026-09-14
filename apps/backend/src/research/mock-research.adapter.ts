import type { AdapterResearchRequest, MarketResearchSourceAdapter, NormalizedResearchEvidence } from './research.types.js';
import { researchContentHash } from './research.types.js';

/** Test/dev only. Never selected for production capability. */
export class MockMarketResearchAdapter implements MarketResearchSourceAdapter {
  constructor(
    private readonly fixtures: NormalizedResearchEvidence[] = [],
    private readonly failures: Array<{ source: string; reason: string }> = [],
  ) {}

  getCapabilities() {
    return {
      id: 'mock',
      adapterType: 'SYSTEM_INTERNAL' as const,
      platforms: ['douyin'],
      productionAvailable: false,
      sourcePolicy: 'fixture',
      dataRights: 'synthetic-test',
      displayAllowed: false,
      analysisAllowed: true,
      retentionPolicy: 'test-only',
    };
  }

  canHandle(_request: AdapterResearchRequest): boolean {
    return true;
  }

  async discover(_request: AdapterResearchRequest) {
    return { configured: true, seeds: this.fixtures.map((item) => item.canonicalUrl ?? item.externalId ?? 'seed') };
  }

  async fetchEvidence(_request: AdapterResearchRequest) {
    const evidence = this.fixtures.map((item) => ({
      ...item,
      normalizedPayload: {
        ...item.normalizedPayload,
        contentHash: researchContentHash(item),
      },
    }));
    return { configured: true, evidence, failures: this.failures };
  }

  normalizeEvidence(raw: unknown): NormalizedResearchEvidence | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return raw as NormalizedResearchEvidence;
  }
}
