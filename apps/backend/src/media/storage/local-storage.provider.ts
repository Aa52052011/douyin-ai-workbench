import { Injectable } from '@nestjs/common';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { LOCAL_STORAGE_PROVIDER_ID } from '../media.constants.js';
import { assertSafeStorageKey } from './storage-key.js';
import type { StorageObject, StorageProvider, StoragePutOptions } from './storage.provider.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly id = LOCAL_STORAGE_PROVIDER_ID;
  private readonly root: string;

  constructor() {
    this.root = resolveStorageRoot();
  }

  async put(key: string, body: Buffer, opts?: StoragePutOptions): Promise<StorageObject> {
    const target = this.resolvePath(key);
    mkdirSync(path.dirname(target), { recursive: true });
    const part = `${target}.part`;
    writeFileSync(part, body);
    renameSync(part, target);
    return {
      provider: this.id,
      key,
      size: body.byteLength,
      mimeType: opts?.mimeType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolvePath(key);
    try {
      return readFileSync(target);
    } catch {
      throw new AppError(ErrorCode.ASSET_NOT_FOUND);
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolvePath(key);
    rmSync(target, { force: true });
    rmSync(`${target}.part`, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const target = this.resolvePath(key);
    try {
      return statSync(target).isFile();
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    assertSafeStorageKey(key);
    return `local://${key}`;
  }

  private resolvePath(key: string): string {
    assertSafeStorageKey(key);
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, key.replaceAll('/', path.sep));
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (resolved !== root && !resolved.startsWith(prefix)) {
      throw new AppError(ErrorCode.ASSET_INVALID_FILE, 'Invalid storage key');
    }
    return resolved;
  }
}

export function resolveStorageRoot(): string {
  const configured = process.env.MEDIA_STORAGE_ROOT?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : './storage');
}
