import { JobKind, JobStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toPublicJob } from './jobs.mapper.js';

describe('jobs mapper', () => {
  it('exposes duration and never treats retry as the same job id', () => {
    const started = new Date('2026-08-31T00:00:00.000Z');
    const completed = new Date('2026-08-31T00:00:02.000Z');
    const job = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      kind: JobKind.VIDEO_GENERATION,
      status: JobStatus.COMPLETED,
      provider: 'mock-video',
      model: null,
      input: {},
      output: { assetId: 'b' },
      error: null,
      progress: 100,
      requestId: 'req',
      scriptId: null,
      videoId: null,
      agentRunId: null,
      lockedAt: started,
      lastHeartbeatAt: started,
      attempt: 1,
      startedAt: started,
      completedAt: completed,
      createdAt: started,
      updatedAt: completed,
    };
    const publicJob = toPublicJob(job);
    expect(publicJob.durationMs).toBe(2000);
    expect(publicJob.id).not.toBe('retry-same');
    expect(JobStatus).not.toHaveProperty('RETRYING');
  });

  it('redacts storageKey from public job output', () => {
    const job = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      kind: JobKind.VIDEO_GENERATION,
      status: JobStatus.COMPLETED,
      provider: 'mock-pipeline',
      model: null,
      input: {},
      output: {
        stages: {
          visual: {
            status: 'completed',
            assetIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
            scenes: [
              {
                sceneId: 's1',
                storageKey: 'v1/secret/path',
                status: 'ready',
              },
            ],
          },
        },
      },
      error: null,
      progress: 100,
      requestId: 'req',
      scriptId: null,
      videoId: null,
      agentRunId: null,
      lockedAt: null,
      lastHeartbeatAt: null,
      attempt: 1,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    const publicJob = toPublicJob(job);
    expect(JSON.stringify(publicJob)).not.toContain('storageKey');
    expect(JSON.stringify(publicJob)).not.toContain('v1/secret/path');
    expect(
      (publicJob.output as { stages: { visual: { scenes: Array<{ status: string }> } } }).stages.visual.scenes[0]
        ?.status,
    ).toBe('ready');
  });

  it('redacts oauth secrets from public job json', () => {
    const job = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: 't',
      workspaceId: 'w',
      projectId: 'p',
      kind: JobKind.VIDEO_PUBLISH,
      status: JobStatus.FAILED,
      provider: null,
      model: null,
      input: { publicationId: 'pub-1', accessToken: 'dummy-access-should-not-leak' },
      output: { refreshToken: 'dummy-refresh-should-not-leak' },
      error: { clientSecret: 'dummy-secret-should-not-leak', code: 'PUBLISH_HANDLER_NOT_IMPLEMENTED' },
      progress: 0,
      requestId: 'req',
      scriptId: null,
      videoId: null,
      agentRunId: null,
      lockedAt: null,
      lastHeartbeatAt: null,
      attempt: 1,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    };
    const publicJob = toPublicJob(job);
    const text = JSON.stringify(publicJob);
    expect(text).not.toContain('dummy-access-should-not-leak');
    expect(text).not.toContain('dummy-refresh-should-not-leak');
    expect(text).not.toContain('dummy-secret-should-not-leak');
    expect(text).not.toContain('accessToken');
    expect((publicJob.input as { publicationId: string }).publicationId).toBe('pub-1');
    expect((publicJob.error as { code: string }).code).toBe('PUBLISH_HANDLER_NOT_IMPLEMENTED');
  });
});
