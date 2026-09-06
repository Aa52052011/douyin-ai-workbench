export type StorageObject = {
  provider: string;
  key: string;
  size: number;
  mimeType?: string;
};

export type StoragePutOptions = {
  mimeType?: string;
  contentLength?: number;
};

export interface StorageProvider {
  readonly id: string;
  put(key: string, body: Buffer, opts?: StoragePutOptions): Promise<StorageObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
