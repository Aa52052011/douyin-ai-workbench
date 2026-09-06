import { AssetStatus, AssetType, type Asset } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionScene } from './production-plan.types.js';
import type { StageContext } from './stage-context.js';
import { isReusableVisualAsset, visualClientRequestId } from './visual-reuse.js';

const SCENE: ProductionScene = {
  sceneId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sourceSectionSequence: 1,
  sourceKind: 'section',
  sequence: 1,
  narration: '旁白',
  subtitle: '字幕',
  visualSuggestion: '清单卡片',
  visualPrompt: '竖屏静帧',
  visualSourceType: 'COLOR_BACKGROUND',
  durationBudget: 2,
  transition: 'cut',
};

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tenantId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    projectId: '33333333-3333-4333-8333-333333333333',
    type: AssetType.IMAGE,
    status: AssetStatus.READY,
    storageProvider: 'local',
    storageKey:
      'v1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    originalFilename: 'section.png',
    mimeType: 'image/png',
    size: 12,
    duration: null,
    width: 1080,
    height: 1920,
    metadata: {
      sceneId: SCENE.sceneId,
      generationVersion: 'gen-1',
      videoId: '44444444-4444-4444-8444-444444444444',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Asset;
}

function ctx(overrides: Partial<StageContext> = {}): StageContext {
  return {
    prisma: {} as StageContext['prisma'],
    jobs: {} as StageContext['jobs'],
    storage: { exists: vi.fn(async () => true) } as unknown as StageContext['storage'],
    job: {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
    } as StageContext['job'],
    plan: { videoId: '44444444-4444-4444-8444-444444444444' } as StageContext['plan'],
    generationVersion: 'gen-1',
    ...overrides,
  };
}

describe('visual reuse rules', () => {
  it('builds clientRequestId from job, scene, and generationVersion', () => {
    expect(visualClientRequestId('job-1', 'scene-1', 'v1')).toBe('job-1:visual:scene-1:v1');
  });

  it('rejects metadata sceneId mismatch', async () => {
    const found = asset({ metadata: { sceneId: 'other', generationVersion: 'gen-1', videoId: '44444444-4444-4444-8444-444444444444' } });
    expect(await isReusableVisualAsset(ctx(), found, SCENE)).toBe(false);
  });

  it('rejects generationVersion mismatch', async () => {
    const found = asset({ metadata: { sceneId: SCENE.sceneId, generationVersion: 'other', videoId: '44444444-4444-4444-8444-444444444444' } });
    expect(await isReusableVisualAsset(ctx(), found, SCENE)).toBe(false);
  });

  it('rejects tenant workspace or project mismatch', async () => {
    expect(await isReusableVisualAsset(ctx(), asset({ tenantId: '99999999-9999-4999-8999-999999999999' }), SCENE)).toBe(
      false,
    );
    expect(await isReusableVisualAsset(ctx(), asset({ workspaceId: '99999999-9999-4999-8999-999999999999' }), SCENE)).toBe(
      false,
    );
    expect(await isReusableVisualAsset(ctx(), asset({ projectId: '99999999-9999-4999-8999-999999999999' }), SCENE)).toBe(
      false,
    );
  });

  it('rejects missing storage even when the row is READY', async () => {
    const current = ctx();
    (current.storage.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect(await isReusableVisualAsset(current, asset(), SCENE)).toBe(false);
  });
});
