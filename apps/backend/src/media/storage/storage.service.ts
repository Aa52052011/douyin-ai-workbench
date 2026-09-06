import { Injectable } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider.js';
import type { StorageObject, StorageProvider, StoragePutOptions } from './storage.provider.js';

@Injectable()
export class StorageService {
  constructor(private readonly local: LocalStorageProvider) {}

  get provider(): StorageProvider {
    return this.local;
  }

  put(key: string, body: Buffer, opts?: StoragePutOptions): Promise<StorageObject> {
    return this.local.put(key, body, opts);
  }

  get(key: string): Promise<Buffer> {
    return this.local.get(key);
  }

  delete(key: string): Promise<void> {
    return this.local.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.local.exists(key);
  }

  getUrl(key: string): string {
    return this.local.getUrl(key);
  }
}
