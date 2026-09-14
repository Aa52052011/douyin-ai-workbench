import { Injectable, Logger } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { asPipelineOutput, type StageContext } from '../pipeline/stage-context.js';
import { planQualityRepairs } from './quality-repair-planner.js';
import { QualityCheckService } from './quality-check.service.js';
import { QualityRepairService } from './quality-repair.service.js';
import { canFinalizeDisposition, qualityGateErrorResult } from './quality-check.js';
import { hashQualityInput } from './quality-hash.js';
import { MAX_QUALITY_REPAIR_ATTEMPTS, type QualityCheckpoint } from './quality.types.js';
import { runMeteringScope } from '../../usage/metering-context.js';

@Injectable()
export class QualityGateService {
  private readonly logger = new Logger(QualityGateService.name);

  constructor(
    private readonly checks: QualityCheckService,
    private readonly repairs: QualityRepairService,
  ) {}

  async run(
    ctx: StageContext,
    composed: { assetId: string; duration: number; width: number; height: number },
  ): Promise<{
    composed: { assetId: string; duration: number; width: number; height: number };
    checkpoint: QualityCheckpoint;
  }> {
    const output = asPipelineOutput(ctx.job.output);
    const hash = hashQualityInput({
      composeAssetId: composed.assetId,
      timelineHash: output.editingTimeline?.timelineHash,
      voiceAssetId: output.stages.voice?.assetIds?.[0],
      subtitleAssetId: output.stages.subtitle?.assetIds?.[0],
    });
    const existing = output.qualityGate;
    if (
      existing?.qualityInputHash === hash &&
      (existing.qualityDisposition === 'PASS' || existing.qualityDisposition === 'BEST_AVAILABLE')
    ) {
      return { composed, checkpoint: existing };
    }

    let current = { ...composed };
    try {
      const qualityChecks = [...(existing?.qualityChecks ?? [])];
      const repairHistory = [...(existing?.repairHistory ?? [])];
      if (ctx.failStage === 'quality_check') {
        throw new Error('quality_gate_injected_failure');
      }
      let attempt = 0;
      let result = await this.checks.evaluate(ctx, current.assetId, 0);
      qualityChecks.push(result);
      let providerUsed = 0;
      while (result.status !== 'PASS' && attempt < MAX_QUALITY_REPAIR_ATTEMPTS) {
        const previous = repairHistory.at(-1);
        const plan = planQualityRepairs({
          result,
          attempt: attempt + 1,
          previousFingerprints: previous?.issueFingerprints,
          previousActions: previous?.actions,
          providerActionsUsed: providerUsed,
        });
        if (plan.actions.length === 0) {
          result = {
            ...result,
            status: result.blockingIssueCount > 0 ? 'FAIL' : 'BEST_AVAILABLE',
            finalDisposition: result.blockingIssueCount > 0 ? 'BLOCKED' : 'BEST_AVAILABLE',
          };
          break;
        }
        const started = Date.now();
        const repairing = asPipelineOutput(ctx.job.output);
        repairing.currentStage = 'repair';
        repairing.stages.repair = {
          status: 'running',
          assetIds: [current.assetId],
          startedAt: new Date().toISOString(),
        };
        await ctx.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, repairing as never, 96);
        ctx.job = await ctx.jobs.getById(ctx.job.tenantId, ctx.job.id);
        const executed = await runMeteringScope(
          {
            tenantId: ctx.job.tenantId,
            workspaceId: ctx.job.workspaceId,
            projectId: ctx.job.projectId,
            videoId: ctx.plan.videoId,
            jobId: ctx.job.id,
            generationVersion: ctx.generationVersion,
            stage: 'REPAIR',
            repairAttempt: attempt + 1,
            repairIssueCode: result.issues[0]?.code,
          },
          () => this.repairs.execute(ctx, plan, current),
        );
        current = {
          assetId: executed.composeAssetId,
          duration: executed.duration,
          width: executed.width,
          height: executed.height,
        };
        providerUsed += executed.providerCalls;
        repairHistory.push({
          attempt: attempt + 1,
          issueFingerprints: result.issues.map((item) => `${item.code}|${item.scope}|${item.shotSequence ?? ''}|${item.assetId ?? ''}`),
          actions: plan.actions.map((item) => item.type),
          beforeHash: result.qualityInputHash,
          afterHash: executed.afterHash,
          result: 'EXECUTED',
          providerCalls: executed.providerCalls,
          durationMs: Date.now() - started,
        });
        this.logger.log(
          JSON.stringify({
            event: 'quality_repair',
            videoId: ctx.plan.videoId,
            generationVersion: ctx.generationVersion,
            attempt: attempt + 1,
            repairActionCount: plan.actions.length,
            repairTypes: plan.actions.map((item) => item.type),
            recomposeCount: plan.requiresRecompose ? 1 : 0,
          }),
        );
        attempt += 1;
        result = await this.checks.evaluate(ctx, current.assetId, attempt);
        qualityChecks.push(result);
      }
      if (result.status !== 'PASS' && result.blockingIssueCount === 0) {
        result = { ...result, status: 'BEST_AVAILABLE', finalDisposition: 'BEST_AVAILABLE' };
      }
      const checkpoint: QualityCheckpoint = {
        rulesetVersion: 'v1',
        qualityInputHash: result.qualityInputHash,
        latestQualityResult: result,
        qualityChecks,
        repairHistory,
        qualityDisposition: result.finalDisposition,
      };
      await this.persist(ctx, checkpoint);
      if (!canFinalizeDisposition(checkpoint.qualityDisposition, true)) {
        throw new AppError(ErrorCode.QUALITY_GATE_BLOCKED, '自动制作未能完成，请重试或调整素材。');
      }
      return { composed: current, checkpoint };
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.QUALITY_GATE_BLOCKED) {
        throw error;
      }
      if (error instanceof AppError) {
        throw error;
      }
      const failed = qualityGateErrorResult(hash, 0);
      await this.persist(ctx, {
        rulesetVersion: 'v1',
        qualityInputHash: hash,
        latestQualityResult: failed,
        qualityChecks: [failed],
        repairHistory: existing?.repairHistory ?? [],
        qualityDisposition: 'BLOCKED',
      });
      throw new AppError(ErrorCode.QUALITY_GATE_ERROR, '质量检查异常，成片未完成。');
    }
  }

  private async persist(ctx: StageContext, checkpoint: QualityCheckpoint) {
    const next = asPipelineOutput(ctx.job.output);
    next.qualityGate = checkpoint;
    await ctx.jobs.mergeOutput(ctx.job.tenantId, ctx.job.id, next as never, 98);
    ctx.job = await ctx.jobs.getById(ctx.job.tenantId, ctx.job.id);
  }
}
