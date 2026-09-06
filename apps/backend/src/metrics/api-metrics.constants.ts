export const API_METRICS_PROVIDER = 'MOCK';

export const API_COLLECTION_KEY_PREFIX = 'api:';

export const MOCK_METRICS_JOB_PROVIDER = 'mock-metrics';

export function apiCollectionKey(jobId: string): string {
  return `${API_COLLECTION_KEY_PREFIX}${jobId}`;
}
