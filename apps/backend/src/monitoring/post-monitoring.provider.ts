export type PostMonitoringValidateInput = {
  platformPostId?: string | null;
  platformUrl?: string | null;
};

export interface PostMonitoringProvider {
  readonly providerId: string;
  readonly status: 'IMPLEMENTED' | 'RESERVED_NOT_IMPLEMENTED';
  validateTarget(input: PostMonitoringValidateInput): { ok: boolean; reason?: string };
  fetchMetrics(): Promise<never> | Promise<{ source: string }>;
  getPostStatus(): Promise<{ status: string }>;
}

export class ManualPostMonitoringProviderV1 implements PostMonitoringProvider {
  readonly providerId = 'manual-post-monitoring:v1';
  readonly status = 'IMPLEMENTED' as const;

  validateTarget(input: PostMonitoringValidateInput) {
    if (!input.platformPostId?.trim() && !input.platformUrl?.trim()) {
      return { ok: false, reason: 'PUBLISHED_POST_IDENTITY_REQUIRED' };
    }
    return { ok: true };
  }

  async fetchMetrics(): Promise<never> {
    throw new Error('MANUAL_PROVIDER_DOES_NOT_FETCH');
  }

  async getPostStatus() {
    return { status: 'USER_ASSERTED' };
  }

  acceptUserSnapshot() {
    return { source: 'MANUAL_ENTRY' as const, externalFetch: false };
  }
}

export class DouyinPostMonitoringProvider implements PostMonitoringProvider {
  readonly providerId = 'douyin-post-monitoring';
  readonly status = 'RESERVED_NOT_IMPLEMENTED' as const;

  validateTarget(): { ok: boolean; reason?: string } {
    return { ok: false, reason: 'RESERVED_NOT_IMPLEMENTED' };
  }

  async fetchMetrics(): Promise<never> {
    throw new Error('RESERVED_NOT_IMPLEMENTED');
  }

  async getPostStatus(): Promise<never> {
    throw new Error('RESERVED_NOT_IMPLEMENTED');
  }
}

export function officialMetricsProviderState() {
  return {
    schemaVersion: 'official.metrics-provider:v1',
    id: 'DouyinPostMonitoringProvider',
    status: 'RESERVED_NOT_IMPLEMENTED' as const,
    reserved: true,
    scraping: 'FORBIDDEN',
  };
}
