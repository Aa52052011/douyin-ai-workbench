import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { directSourceAwareEditorialPlan } from '../source-aware-editorial/director.js';
import { mapPlanToRuntimeTimeline } from '../source-aware-editorial/timeline.js';
import { LANDSCAPE_PROFILE_ID, VERTICAL_PROFILE_ID } from './dual-output.js';
import { evaluateFinalTruthGate, type DualProfileProductionExecutionPlanV1 } from './final-readiness.js';
import type { HumanVisualApprovalV1, ProductionAuthorizationV1 } from './visual-approval.js';
import {
  assertLiveProductionBindings,
  assertProductionSourcePath,
  buildLandscapeProductionFilter,
  buildPersistedArtifact,
  buildVerticalProductionFilterGraph,
  consumeAuthorizationAfterDualRuns,
  landscapeProductionFfmpegArgs,
  planStatusAfterRuns,
  productionArtifactFileName,
  validateProductionProbe,
  verticalProductionFfmpegArgs,
  decideProductionUsable,
  type ProbeSummaryV1,
  type ProductionExecutionRunV1,
} from './production-render.js';
import { FileProductionRunStore, productionMediaFile } from './production-run-store.js';
import { FileExecutionPlanStore } from './execution-plan-store.js';

function probeFromJson(raw: string, bytes: number): ProbeSummaryV1 {
  const json = JSON.parse(raw || '{}') as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      avg_frame_rate?: string;
      duration?: string;
    }>;
    format?: { duration?: string };
  };
  const video = json.streams?.find((item) => item.codec_type === 'video');
  const audio = json.streams?.find((item) => item.codec_type === 'audio');
  const fpsParts = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = fpsParts[1] ? fpsParts[0] / fpsParts[1] : fpsParts[0];
  return {
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    codec: video?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    pix_fmt: video?.pix_fmt ?? null,
    fps,
    durationSec: Number(video?.duration ?? json.format?.duration ?? NaN),
    bytes,
  };
}

async function probeFile(filePath: string): Promise<ProbeSummaryV1> {
  const result = await runChildProcess(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], {
    timeoutMs: 20_000,
  });
  return probeFromJson(result.stdout, existsSync(filePath) ? statSync(filePath).size : 0);
}

async function decodeFile(filePath: string): Promise<boolean> {
  try {
    await runChildProcess(ffmpegBin(), ['-hide_banner', '-v', 'error', '-i', filePath, '-f', 'null', '-'], { timeoutMs: 180_000 });
    return true;
  } catch {
    return false;
  }
}

function pendingRun(input: {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  reviewSessionId: string;
  profileId: string;
  configHash: string;
  sourceAssetId: string;
  visualApprovalId: string;
  productionAuthorizationId: string;
  productionPlanId: string;
  inputRef: string;
}): ProductionExecutionRunV1 {
  return {
    schemaVersion: 'production.execution-run:v1',
    executionRunId: randomUUID(),
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewSessionId: input.reviewSessionId,
    profileId: input.profileId,
    status: 'PENDING',
    inputRef: input.inputRef,
    outputRef: null,
    startedAt: null,
    completedAt: null,
    configHash: input.configHash,
    sourceAssetId: input.sourceAssetId,
    visualApprovalId: input.visualApprovalId,
    productionAuthorizationId: input.productionAuthorizationId,
    productionPlanId: input.productionPlanId,
    truthGateRef: 'final.truth-gate:v1',
    restrictedClaims: ['C5', 'C6'],
    ffmpegCalls: 0,
    ffmpegExit: null,
    failureCode: null,
  };
}

export async function renderDualProfileProduction(input: {
  sourcePath: string;
  plan: DualProfileProductionExecutionPlanV1;
  approval: HumanVisualApprovalV1;
  authorization: ProductionAuthorizationV1;
  repoRoot?: string;
  timeoutMs?: number;
  enforceFrozenContent01Ids?: boolean;
}): Promise<{
  vertical: ProductionExecutionRunV1;
  landscape: ProductionExecutionRunV1;
  verticalArtifact: ReturnType<typeof buildPersistedArtifact> | null;
  landscapeArtifact: ReturnType<typeof buildPersistedArtifact> | null;
  consumption: ReturnType<typeof consumeAuthorizationAfterDualRuns>;
  planStatus: ReturnType<typeof planStatusAfterRuns>;
  sourceMutated: boolean;
  providerCalls: 0;
  visionCalls: 0;
  llmCalls: 0;
}> {
  assertLiveProductionBindings({ plan: input.plan, approval: input.approval, authorization: input.authorization });
  if (input.enforceFrozenContent01Ids) {
    const { assertFrozenProductionBindings } = await import('./production-render.js');
    assertFrozenProductionBindings({ plan: input.plan, approval: input.approval, authorization: input.authorization });
  }
  assertProductionSourcePath(input.sourcePath);
  if (!existsSync(input.sourcePath)) throw new Error('SOURCE_ORIGINAL_MISSING');
  const sourceBefore = statSync(input.sourcePath);
  const editorial = directSourceAwareEditorialPlan({ assetId: input.plan.sourceAssetId });
  if (editorial.assetId !== input.plan.sourceAssetId) throw new Error('SOURCE_AWARE_ASSET_MISMATCH');
  const timeline = mapPlanToRuntimeTimeline(editorial);
  const expectedDurationMs = editorial.coverage.endMs - editorial.coverage.startMs;
  const sourceProbe = await probeFile(input.sourcePath);
  if (!sourceProbe.hasVideo || !sourceProbe.width || !sourceProbe.height) throw new Error('SOURCE_PROBE_FAILED');
  const repoRoot = input.repoRoot ?? process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd();
  const runs = new FileProductionRunStore(repoRoot);
  const planStore = new FileExecutionPlanStore(repoRoot);
  const timeoutMs = input.timeoutMs ?? 600_000;
  const truth = evaluateFinalTruthGate();
  if (truth.result !== 'PASS_WITH_RESTRICTIONS' || truth.restrictedClaims.join(',') !== 'C5,C6') {
    throw new Error('STOP_TRUTH_RESTRICTIONS_LIFTED');
  }

  await planStore.upsert({ ...input.plan, status: 'RENDERING' });

  const renderOne = async (profileId: string): Promise<{ run: ProductionExecutionRunV1; artifact: ReturnType<typeof buildPersistedArtifact> | null }> => {
    const profile = input.plan.profiles.find((item) => item.profileId === profileId);
    if (!profile) throw new Error('PROFILE_MISSING');
    const fileName = productionArtifactFileName(profileId);
    const outPath = productionMediaFile({
      tenantId: input.plan.tenantId,
      reviewSessionId: input.plan.reviewSessionId,
      fileName,
      repoRoot,
    });
    let run = pendingRun({
      tenantId: input.plan.tenantId,
      workspaceId: input.plan.workspaceId,
      projectId: input.plan.projectId,
      reviewSessionId: input.plan.reviewSessionId,
      profileId,
      configHash: profile.configHash,
      sourceAssetId: input.plan.sourceAssetId,
      visualApprovalId: input.approval.approvalId,
      productionAuthorizationId: input.authorization.authorizationId,
      productionPlanId: input.plan.planId,
      inputRef: input.sourcePath,
    });
    run = { ...run, status: 'RUNNING', startedAt: new Date().toISOString(), outputRef: outPath };
    await runs.putRun(run);
    mkdirSync(path.dirname(outPath), { recursive: true });
    const tempPath = `${outPath}.tmp.mp4`;
    if (existsSync(tempPath)) unlinkSync(tempPath);
    const filter =
      profileId === VERTICAL_PROFILE_ID
        ? buildVerticalProductionFilterGraph({
            segments: timeline.segments,
            sourceWidth: sourceProbe.width!,
            sourceHeight: sourceProbe.height!,
          }).filter
        : buildLandscapeProductionFilter(editorial.coverage.endMs / 1000).filter;
    const args =
      profileId === VERTICAL_PROFILE_ID
        ? verticalProductionFfmpegArgs(input.sourcePath, tempPath, filter)
        : landscapeProductionFfmpegArgs(input.sourcePath, tempPath, filter);
    let ffmpegExit: number | null = 0;
    try {
      await runChildProcess(ffmpegBin(), args, { timeoutMs });
      run = { ...run, ffmpegCalls: 1, ffmpegExit: 0 };
    } catch {
      ffmpegExit = 1;
      run = { ...run, ffmpegCalls: 1, ffmpegExit, status: 'FAILED', failureCode: 'FFMPEG_FAILED', completedAt: new Date().toISOString() };
      if (existsSync(tempPath)) unlinkSync(tempPath);
      await runs.putRun(run);
      return { run, artifact: null };
    }
    const after = statSync(input.sourcePath);
    if (after.size !== sourceBefore.size || after.mtimeMs !== sourceBefore.mtimeMs) {
      if (existsSync(tempPath)) unlinkSync(tempPath);
      run = { ...run, status: 'FAILED', failureCode: 'SOURCE_MUTATED', completedAt: new Date().toISOString() };
      await runs.putRun(run);
      return { run, artifact: null };
    }
    const probed = await probeFile(tempPath);
    const decodeOk = await decodeFile(tempPath);
    const probeCheck = validateProductionProbe({
      profileId,
      probe: probed,
      expectedDurationMs,
      decodeOk,
    });
    if (!probeCheck.ok) {
      if (existsSync(tempPath)) unlinkSync(tempPath);
      run = { ...run, status: 'FAILED', failureCode: probeCheck.code, completedAt: new Date().toISOString() };
      await runs.putRun(run);
      return { run, artifact: null };
    }
    if (existsSync(outPath)) unlinkSync(outPath);
    renameSync(tempPath, outPath);
    const usable = decideProductionUsable({
      renderSuccess: true,
      artifactValid: true,
      probeOk: true,
      decodeOk: true,
      truthAcceptable: true,
      bindingsMatch: true,
      visualApproved: true,
      productionAuthorized: true,
    });
    run = {
      ...run,
      status: usable ? 'COMPLETED' : 'FAILED',
      failureCode: usable ? null : 'PRODUCTION_USABLE_FALSE',
      outputRef: outPath,
      completedAt: new Date().toISOString(),
    };
    await runs.putRun(run);
    const artifact = buildPersistedArtifact({
      artifactId: randomUUID(),
      run,
      probe: { ...probed, bytes: statSync(outPath).size },
      productionUsable: usable,
    });
    await runs.putArtifact(input.plan.tenantId, input.plan.reviewSessionId, artifact);
    return { run, artifact };
  };

  const verticalResult = await renderOne(VERTICAL_PROFILE_ID);
  const landscapeResult = await renderOne(LANDSCAPE_PROFILE_ID);
  const afterAll = statSync(input.sourcePath);
  const sourceMutated = afterAll.size !== sourceBefore.size || afterAll.mtimeMs !== sourceBefore.mtimeMs;
  const consumption = consumeAuthorizationAfterDualRuns({
    authorizationId: input.authorization.authorizationId,
    tenantId: input.plan.tenantId,
    reviewSessionId: input.plan.reviewSessionId,
    productionPlanId: input.plan.planId,
    vertical: verticalResult.run,
    landscape: landscapeResult.run,
  });
  await runs.putConsumption(consumption);
  const planStatus = planStatusAfterRuns(verticalResult.run.status, landscapeResult.run.status);
  await planStore.upsert({
    ...input.plan,
    status: planStatus,
    visualApprovalId: input.approval.approvalId,
    productionAuthorizationId: input.authorization.authorizationId,
    executionPreparationId: input.plan.executionPreparationId,
  });
  return {
    vertical: verticalResult.run,
    landscape: landscapeResult.run,
    verticalArtifact: verticalResult.artifact,
    landscapeArtifact: landscapeResult.artifact,
    consumption,
    planStatus,
    sourceMutated,
    providerCalls: 0,
    visionCalls: 0,
    llmCalls: 0,
  };
}
