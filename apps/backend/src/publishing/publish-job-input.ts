import { isUuid } from '../common/ids.js';

export function readPublicationIdFromJobInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const value = (input as Record<string, unknown>).publicationId;
  return typeof value === 'string' && isUuid(value) ? value : undefined;
}
