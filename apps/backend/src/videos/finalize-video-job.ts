import { AssetLinkRole, AssetStatus, AssetType, JobStatus, Prisma, PrismaClient, VideoStatus } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { asPipelineOutput } from './pipeline/stage-context.js';

export type FinalizeJobResult = {
  jobId: string;
  videoId: string;
  outputAssetId: string;
  reused: boolean;
};

export async function finalizeJob(
  prisma: PrismaClient,
  input: { tenantId: string; jobId: string; outputAssetId: string; duration?: number; width?: number; height?: number },
): Promise<FinalizeJobResult> {
  if (!isUuid(input.jobId) || !isUuid(input.outputAssetId) || !isUuid(input.tenantId)) {
    throw new AppError(ErrorCode.JOB_CONFLICT);
  }
  return prisma.$transaction((tx) => finalizeInTx(tx, input));
}

async function finalizeInTx(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; jobId: string; outputAssetId: string; duration?: number; width?: number; height?: number },
): Promise<FinalizeJobResult> {
  const job = await tx.job.findFirst({
    where: { id: input.jobId, tenantId: input.tenantId },
  });
  if (!job?.videoId) {
    throw new AppError(ErrorCode.JOB_NOT_FOUND);
  }
  if (job.status === JobStatus.CANCELLED || job.status === JobStatus.FAILED) {
    throw new AppError(ErrorCode.JOB_CONFLICT);
  }
  if (job.status !== JobStatus.RUNNING && job.status !== JobStatus.COMPLETED) {
    throw new AppError(ErrorCode.JOB_CONFLICT);
  }

  const video = await tx.video.findFirst({
    where: {
      id: job.videoId,
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      projectId: job.projectId,
      deletedAt: null,
    },
  });
  if (!video) {
    throw new AppError(ErrorCode.VIDEO_NOT_FOUND);
  }

  const asset = await tx.asset.findFirst({
    where: {
      id: input.outputAssetId,
      tenantId: job.tenantId,
      workspaceId: job.workspaceId,
      projectId: job.projectId,
      status: AssetStatus.READY,
      deletedAt: null,
    },
  });
  if (!asset || asset.type !== AssetType.VIDEO) {
    throw new AppError(ErrorCode.ASSET_NOT_FOUND);
  }

  const outputLink = await tx.assetLink.findFirst({
    where: { tenantId: job.tenantId, videoId: video.id, role: AssetLinkRole.VIDEO_OUTPUT },
  });

  const known = [input.outputAssetId, outputLink?.assetId, video.outputAssetId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (new Set(known).size > 1) {
    throw new AppError(ErrorCode.VIDEO_CONFLICT);
  }

  const consistentCompleted =
    job.status === JobStatus.COMPLETED &&
    video.status === VideoStatus.COMPLETED &&
    video.outputAssetId === asset.id &&
    outputLink?.assetId === asset.id &&
    video.sourceJobId === job.id;
  if (consistentCompleted) {
    return { jobId: job.id, videoId: video.id, outputAssetId: asset.id, reused: true };
  }

  if (job.status === JobStatus.COMPLETED && !healableCompleted(job, video, outputLink, asset.id)) {
    throw new AppError(ErrorCode.VIDEO_CONFLICT);
  }

  if (!outputLink) {
    await tx.assetLink.create({
      data: {
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        assetId: asset.id,
        videoId: video.id,
        jobId: job.id,
        role: AssetLinkRole.VIDEO_OUTPUT,
      },
    });
  }

  const duration = input.duration ?? asset.duration ?? video.duration;
  const now = new Date();
  await tx.video.update({
    where: { id_tenantId: { id: video.id, tenantId: job.tenantId } },
    data: {
      outputAssetId: asset.id,
      sourceJobId: job.id,
      duration,
      width: input.width ?? asset.width ?? video.width,
      height: input.height ?? asset.height ?? video.height,
      status: VideoStatus.COMPLETED,
    },
  });

  const output = asPipelineOutput(job.output);
  output.currentStage = 'finalize';
  output.final = {
    assetId: asset.id,
    duration: duration ?? 0,
    completedAt: now.toISOString(),
  };
  if (duration != null) {
    output.timeline = { ...output.timeline, targetDuration: output.timeline?.targetDuration ?? duration, composeDuration: duration };
  }

  await tx.job.update({
    where: { id_tenantId: { id: job.id, tenantId: job.tenantId } },
    data: {
      status: JobStatus.COMPLETED,
      progress: 100,
      output: output as never,
      completedAt: job.completedAt ?? now,
      lockedAt: null,
      lastHeartbeatAt: now,
    },
  });

  return { jobId: job.id, videoId: video.id, outputAssetId: asset.id, reused: Boolean(outputLink || video.outputAssetId) };
}

function healableCompleted(
  job: { id: string; status: JobStatus },
  video: { status: VideoStatus; outputAssetId: string | null; sourceJobId: string | null },
  link: { assetId: string } | null,
  assetId: string,
): boolean {
  if (job.status !== JobStatus.COMPLETED) {
    return true;
  }
  const pointerOk = !video.outputAssetId || video.outputAssetId === assetId;
  const linkOk = !link || link.assetId === assetId;
  const sourceOk = !video.sourceJobId || video.sourceJobId === job.id;
  return pointerOk && linkOk && sourceOk && Boolean(video.outputAssetId || link);
}
