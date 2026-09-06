import type { Job, PrismaClient } from '@prisma/client';
import type { JobsService } from '../../jobs/jobs.service.js';
import type { StorageService } from '../../media/storage/storage.service.js';
import type { JobPipelineOutput, PipelineStageName, VideoProductionPlan } from './production-plan.types.js';

export type StageContext = {
  prisma: PrismaClient;
  jobs: JobsService;
  storage: StorageService;
  job: Job;
  plan: VideoProductionPlan;
  generationVersion: string;
  failStage?: PipelineStageName | 'all' | 'finalize';
  failVisualAfter?: number;
};

export function asPipelineOutput(value: unknown): JobPipelineOutput {
  const current = value && typeof value === 'object' ? (value as JobPipelineOutput) : undefined;
  return {
    currentStage: current?.currentStage,
    stages: current?.stages ?? {},
    usage: current?.usage ?? {
      imageCount: 0,
      audioCharacters: 0,
      audioSeconds: 0,
      videoSeconds: 0,
      estimatedCost: 0,
    },
    timeline: current?.timeline,
    final: current?.final,
  };
}

export function mockFailVisualAfter(requirements?: string): number | undefined {
  const match = /^__mock_fail_visual_after_(\d+)__$/.exec(requirements ?? '');
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function mockFailStage(requirements?: string): PipelineStageName | 'all' | 'finalize' | undefined {
  if (requirements === '__mock_fail_visual__') {
    return 'visual';
  }
  if (requirements === '__mock_fail_voice__') {
    return 'voice';
  }
  if (requirements === '__mock_fail_subtitle__') {
    return 'subtitle';
  }
  if (requirements === '__mock_fail_compose__' || requirements === '__mock_fail__') {
    return 'compose';
  }
  if (requirements === '__mock_fail_finalize__') {
    return 'finalize';
  }
  return undefined;
}
