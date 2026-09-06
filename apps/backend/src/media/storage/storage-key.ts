import { randomUUID } from 'node:crypto';
import { STORAGE_KEY_RE } from '../media.constants.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';

export function buildStorageKey(input: {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  assetId: string;
  objectId?: string;
}): string {
  const objectId = input.objectId ?? randomUUID();
  const key = `v1/${input.tenantId}/${input.workspaceId}/${input.projectId}/${input.assetId}/${objectId}`;
  assertSafeStorageKey(key);
  return key;
}

export function assertSafeStorageKey(key: string): void {
  if (
    !key ||
    key.includes('\0') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.startsWith('/') ||
    /^[a-zA-Z]:/.test(key) ||
    !STORAGE_KEY_RE.test(key)
  ) {
    throw new AppError(ErrorCode.ASSET_INVALID_FILE, 'Invalid storage key');
  }
}

export function sanitizeOriginalFilename(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  const stripped = name.replace(/\0/g, '').replace(/[/\\]+/g, '/');
  const base = stripped.split('/').pop() ?? '';
  const cleaned = base.replace(/\.\./g, '').trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, 200);
}

export function extensionOf(filename: string | undefined): string {
  if (!filename || !filename.includes('.')) {
    return '';
  }
  return `.${filename.split('.').pop()?.toLowerCase() ?? ''}`;
}
