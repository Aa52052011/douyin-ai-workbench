import type { Asset, Job, Video } from '@prisma/client';
import { toPublicAsset, type AssetPublic } from '../assets/assets.mapper.js';
import { toPublicJob, type JobPublic } from '../jobs/jobs.mapper.js';

export type VideoPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  scriptId: string | null;
  scriptTitle: string | null;
  outputAssetId: string | null;
  sourceJobId: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  job: JobPublic | null;
  outputAsset: AssetPublic | null;
};

type VideoPublicSource = Pick<
  Video,
  | 'id'
  | 'tenantId'
  | 'workspaceId'
  | 'projectId'
  | 'scriptId'
  | 'outputAssetId'
  | 'sourceJobId'
  | 'duration'
  | 'width'
  | 'height'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

export function toPublicVideo(
  video: VideoPublicSource,
  extras?: { scriptTitle?: string | null; job?: Job | null; outputAsset?: Asset | null },
): VideoPublic {
  return {
    id: video.id,
    tenantId: video.tenantId,
    workspaceId: video.workspaceId,
    projectId: video.projectId,
    scriptId: video.scriptId,
    scriptTitle: extras?.scriptTitle ?? null,
    outputAssetId: video.outputAssetId,
    sourceJobId: video.sourceJobId,
    duration: video.duration,
    width: video.width,
    height: video.height,
    status: video.status,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    job: extras?.job ? toPublicJob(extras.job) : null,
    outputAsset: extras?.outputAsset ? toPublicAsset(extras.outputAsset) : null,
  };
}
