import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeterministicVisualCacheKey, cacheObjectName, currentCacheVersions } from './cache-key.js';
import { LocalJsonVisualAnalysisCacheStore } from './local-json-visual-analysis-cache-store.js';
import { sanitizeFactsForCache, validateCacheRecord } from './sanitize-facts.js';
import { buildB11Facts, buildMediaMetadata } from '../deterministic-metadata-analyzer.js';
import { DETERMINISTIC_ANALYZER_VERSION, DETERMINISTIC_VISUAL_SCHEMA } from '../deterministic-visual.types.js';

const meta = buildMediaMetadata({ width: 100, height: 100, hasAudio: false, mimeType: 'video/mp4' })!;

describe('cache key', () => {
  it('changes when crop or sampling version changes', () => {
    const base = { contentHash: 'abc', ...currentCacheVersions() };
    const same = buildDeterministicVisualCacheKey(base);
    const crop = buildDeterministicVisualCacheKey({ ...base, cropScoringVersion: 'crop.geometry:v2' });
    const sampling = buildDeterministicVisualCacheKey({ ...base, samplingConfigVersion: 'uniform-v2' });
    expect(same).toBe(buildDeterministicVisualCacheKey(base));
    expect(crop).not.toBe(same);
    expect(sampling).not.toBe(same);
    expect(cacheObjectName(same)).toMatch(/^[a-f0-9]+\.json$/);
  });

  it('does not include assetId', () => {
    const a = buildDeterministicVisualCacheKey({ contentHash: 'same' });
    const b = buildDeterministicVisualCacheKey({ contentHash: 'same' });
    expect(a).toBe(b);
  });
});

describe('local json cache store', () => {
  it('writes atomically and recovers from corrupt JSON', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'acf-dva-cache-'));
    const store = new LocalJsonVisualAnalysisCacheStore(dir);
    const key = buildDeterministicVisualCacheKey({ contentHash: 'h1' });
    const facts = buildB11Facts({ assetId: 'a1', contentHash: 'h1', metadata: meta });
    facts.deterministicStatus = 'READY';
    const record = {
      schemaVersion: DETERMINISTIC_VISUAL_SCHEMA,
      analysisVersion: DETERMINISTIC_ANALYZER_VERSION,
      cacheKey: key,
      contentHash: 'h1',
      createdAt: new Date().toISOString(),
      completedStages: facts.completedStages,
      status: facts.status,
      deterministicStatus: 'READY',
      facts: sanitizeFactsForCache(facts),
    };
    await store.set(key, record);
    const hit = await store.get(key);
    expect(hit.status).toBe('HIT');
    const file = path.join(dir, cacheObjectName(key));
    await writeFile(file, '{not-json', 'utf8');
    const invalid = await store.get(key);
    expect(invalid.status).toBe('INVALID');
    const miss = await store.get(key);
    expect(miss.status).toBe('MISS');
  });

  it('rejects schema mismatch even if JSON parses', async () => {
    const key = 'abc';
    const facts = buildB11Facts({ assetId: 'a1', contentHash: 'h1', metadata: meta });
    const bad = {
      schemaVersion: 'other',
      analysisVersion: DETERMINISTIC_ANALYZER_VERSION,
      cacheKey: key,
      contentHash: 'h1',
      createdAt: new Date().toISOString(),
      completedStages: facts.completedStages,
      status: 'PARTIAL',
      facts,
    };
    expect(validateCacheRecord(bad, key).ok).toBe(false);
  });
});

describe('sanitize', () => {
  it('drops tempRef and windows paths, keeps fileSize', () => {
    const facts = buildB11Facts({
      assetId: 'a1',
      contentHash: 'h1',
      metadata: { ...meta, fileSize: 12 },
    });
    const dirty = { ...facts, tempRef: 'C:\\Users\\x\\a.mp4' } as typeof facts & { tempRef: string };
    const clean = sanitizeFactsForCache(dirty);
    expect(JSON.stringify(clean)).not.toMatch(/C:\\/);
    expect(clean.metadata.fileSize).toBe(12);
  });
});
