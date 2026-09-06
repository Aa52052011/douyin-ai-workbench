import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { MockVideoProvider } from '../providers/mock-video.provider.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { assertSafeStorageKey, buildStorageKey, sanitizeOriginalFilename } from './storage-key.js';
import { StorageService } from './storage.service.js';

const ids = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  assetId: '44444444-4444-4444-8444-444444444444',
};

describe('storage key', () => {
  it('builds a tenant-scoped key without the original filename', () => {
    const key = buildStorageKey({ ...ids, objectId: '55555555-5555-4555-8555-555555555555' });
    expect(key).toContain(ids.tenantId);
    expect(key).not.toContain('secret.mp4');
    expect(() => assertSafeStorageKey(key)).not.toThrow();
  });

  it('rejects path traversal, windows paths and null bytes', () => {
    expect(() => assertSafeStorageKey('../etc/passwd')).toThrow();
    expect(() => assertSafeStorageKey('C:\\\\Windows\\\\a')).toThrow();
    expect(() => assertSafeStorageKey('v1/../a')).toThrow();
    expect(() => assertSafeStorageKey('v1/a\\b')).toThrow();
    expect(sanitizeOriginalFilename('../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitizeOriginalFilename('evil\0.png')).toBe('evil.png');
  });
});

describe('LocalStorageProvider', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-media-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previous;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('puts, reads, exists and deletes inside the jail', async () => {
    const provider = new LocalStorageProvider();
    const key = buildStorageKey({ ...ids, objectId: '55555555-5555-4555-8555-555555555555' });
    await provider.put(key, Buffer.from('hello'));
    expect(await provider.exists(key)).toBe(true);
    expect((await provider.get(key)).toString()).toBe('hello');
    expect(provider.getUrl(key)).toBe(`local://${key}`);
    expect(provider.getUrl(key)).not.toContain(root);
    await provider.delete(key);
    expect(await provider.exists(key)).toBe(false);
  });

  it('refuses to write outside the storage root', async () => {
    const provider = new LocalStorageProvider();
    await expect(provider.put('../escape.txt', Buffer.from('x'))).rejects.toMatchObject({
      code: ErrorCode.ASSET_INVALID_FILE,
    });
  });
});

describe('MockVideoProvider', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.MEDIA_STORAGE_ROOT;
    root = mkdtempSync(path.join(os.tmpdir(), 'acf-mock-video-'));
    process.env.MEDIA_STORAGE_ROOT = root;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.MEDIA_STORAGE_ROOT;
    } else {
      process.env.MEDIA_STORAGE_ROOT = previous;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('writes a real file through StorageService', async () => {
    mkdirSync(root, { recursive: true });
    const storage = new StorageService(new LocalStorageProvider());
    const provider = new MockVideoProvider(storage);
    const key = buildStorageKey({ ...ids, objectId: '55555555-5555-4555-8555-555555555555' });
    const result = await provider.render({
      requestId: 'req-1',
      storageKey: key,
      scriptId: ids.assetId,
    });
    expect(result.size).toBeGreaterThan(0);
    expect(await storage.exists(key)).toBe(true);
  });

  it('fails on the mock sentinel', async () => {
    const storage = new StorageService(new LocalStorageProvider());
    const provider = new MockVideoProvider(storage);
    const key = buildStorageKey({ ...ids, objectId: '55555555-5555-4555-8555-555555555555' });
    await expect(
      provider.render({
        requestId: 'req-1',
        storageKey: key,
        scriptId: ids.assetId,
        requirements: '__mock_fail__',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VIDEO_PROVIDER_FAILED });
  });
});
