import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cacheObjectName } from './cache-key.js';
import type { CacheGetResult, VisualAnalysisCacheStore, VisualCacheRecord } from './cache.types.js';
import { validateCacheRecord } from './sanitize-facts.js';

export function defaultVisualCacheRoot(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const override = env.ACF_VISUAL_CACHE_ROOT?.trim();
  if (override) {
    return override;
  }
  return path.join(cwd, '.local', 'cache', 'production-v2', 'visual', 'deterministic');
}

export class LocalJsonVisualAnalysisCacheStore implements VisualAnalysisCacheStore {
  constructor(private readonly rootDir: string) {}

  private fileFor(cacheKey: string): string {
    return path.join(this.rootDir, cacheObjectName(cacheKey));
  }

  async get(cacheKey: string): Promise<CacheGetResult> {
    const file = this.fileFor(cacheKey);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { status: 'MISS' };
      }
      throw Object.assign(new Error('CACHE_READ_FAILED'), { code: 'CACHE_READ_FAILED' });
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const check = validateCacheRecord(parsed, cacheKey);
      if (!check.ok) {
        await rm(file, { force: true });
        return { status: 'INVALID', reason: check.reason };
      }
      return { status: 'HIT', record: check.record };
    } catch {
      await rm(file, { force: true });
      return { status: 'INVALID', reason: 'malformed' };
    }
  }

  async set(cacheKey: string, record: VisualCacheRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const file = this.fileFor(cacheKey);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(record), 'utf8');
    await rename(tmp, file);
  }

  async delete(cacheKey: string): Promise<void> {
    await rm(this.fileFor(cacheKey), { force: true });
  }
}
