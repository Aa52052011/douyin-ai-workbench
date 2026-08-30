import { randomUUID } from 'node:crypto';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

export function resolveRequestId(header?: string): string {
  if (header && REQUEST_ID_RE.test(header)) {
    return header;
  }
  return randomUUID();
}
