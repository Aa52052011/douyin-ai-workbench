import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { UsageOperationType, UsageResourceType, UsageUnitType } from '@prisma/client';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError, MODEL_BUSY_USER_MESSAGE } from '../agent.errors.js';
import { getMeteringScope } from '../../usage/metering-context.js';
import { promptFingerprint, usageIdempotencyKey } from '../../usage/usage-idempotency.js';
import { withUsageMetering } from '../../usage/with-usage-metering.js';
import { UsageMeteringService } from '../../usage/usage-metering.service.js';
import { isAgentExecutionAborted, getAgentExecutionAbortSignal, remainingAgentBudgetMs } from '../timeout.js';
import {
  isModelFailoverEnabled,
  MIN_ROUTE_ATTEMPT_MS,
  readModelFailoverConfig,
  readModelRouteTimeoutConfig,
  resolveModelProviderId,
} from './model.config.js';
import { classifyModelError, type ClassifiedModelError } from './model-error-classify.js';
import { MockModelProvider } from './mock.provider.js';
import { modelRouteKey, ModelRouteHealthRegistry } from './model-route-health.js';
import { RealModelProvider } from './real.provider.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

type RouteAttemptMeta = {
  callKind: 'llm' | 'RECOVERY_PROBE';
  role?: 'primary' | 'backup' | 'single' | 'probe';
  routeKey?: string;
  selectedRoute?: string;
  fallbackUsed?: boolean;
  failoverReason?: string;
  primaryFailureReason?: string;
  primarySkipped?: boolean;
  skipReason?: string;
  forceNewAttemptKey?: boolean;
};

@Injectable()
export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  defaultProviderId: string;
  private readonly health: ModelRouteHealthRegistry;
  private readonly logger = new Logger(ModelRouter.name);
  private probeLocked = false;

  constructor(
    mock: MockModelProvider,
    real: RealModelProvider,
    @Optional() private readonly metering?: UsageMeteringService,
    @Optional() health?: ModelRouteHealthRegistry,
  ) {
    this.register(mock);
    this.register(real);
    this.health = health ?? new ModelRouteHealthRegistry();
    this.defaultProviderId = resolveModelProviderId();
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const executionSignal = getAgentExecutionAbortSignal();
    const providerId = request.provider ?? this.defaultProviderId;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new AgentError(ErrorCode.MODEL_ERROR, `Model provider ${providerId} is not configured`);
    }
    const failover = readModelFailoverConfig();
    const failoverOn =
      isModelFailoverEnabled(failover, providerId) &&
      (!request.model || request.model === failover.primaryName);

    if (!failoverOn) {
      return this.invokeOnce(provider, providerId, { ...request, provider: providerId }, {
        callKind: 'llm',
        role: 'single',
      });
    }

    const primaryKey = modelRouteKey(providerId, failover.primaryName);
    const backupKey = modelRouteKey(providerId, failover.fallback1Name);
    let skipPrimary = false;
    let skipReason: string | undefined;
    let primaryFailure: ClassifiedModelError | undefined;

    if (this.health.isOpen(primaryKey)) {
      if (this.health.isProbeEligible(primaryKey) && this.tryLockProbe()) {
        try {
          this.health.markRecovering(primaryKey);
          const recovered = await this.runRecoveryProbe(
            provider,
            providerId,
            failover.primaryName,
            request,
            executionSignal,
          );
          if (recovered) {
            this.health.recordSuccess(primaryKey);
          } else {
            this.health.reopen(primaryKey, failover.cooldownMs);
            skipPrimary = true;
            skipReason = 'OPEN_CIRCUIT';
          }
        } finally {
          this.probeLocked = false;
        }
      } else {
        skipPrimary = true;
        skipReason = 'OPEN_CIRCUIT';
      }
    }

    this.throwIfAgentAborted(executionSignal);

    if (!skipPrimary) {
      this.throwIfInsufficientBudget('primary');
      try {
        const result = await this.invokeOnce(
          provider,
          providerId,
          { ...request, provider: providerId, model: failover.primaryName },
          {
            callKind: 'llm',
            role: 'primary',
            routeKey: primaryKey,
            selectedRoute: primaryKey,
            fallbackUsed: false,
          },
        );
        this.health.recordSuccess(primaryKey);
        return result;
      } catch (error) {
        this.throwIfAgentAborted(executionSignal, error);
        const classified = classifyModelError(error);
        if (classified.class !== 'FAILOVER_ELIGIBLE') {
          throw error;
        }
        this.health.recordEligibleFailure(primaryKey, failover.failureThreshold, failover.cooldownMs);
        primaryFailure = classified;
        this.logger.warn(
          JSON.stringify({
            event: 'model_route_failover',
            routeKey: primaryKey,
            reason: classified.reason,
            httpStatus: classified.httpStatus ?? null,
          }),
        );
      }
    }

    this.throwIfAgentAborted(executionSignal);
    this.throwIfInsufficientBudget('backup');

    try {
      return await this.invokeOnce(
        provider,
        providerId,
        { ...request, provider: providerId, model: failover.fallback1Name },
        {
          callKind: 'llm',
          role: 'backup',
          routeKey: backupKey,
          selectedRoute: backupKey,
          fallbackUsed: true,
          failoverReason: primaryFailure?.reason ?? skipReason ?? 'OPEN_CIRCUIT',
          primaryFailureReason: primaryFailure?.reason,
          primarySkipped: skipPrimary,
          skipReason,
          forceNewAttemptKey: true,
        },
      );
    } catch (error) {
      this.throwIfAgentAborted(executionSignal, error);
      this.logger.warn(
        JSON.stringify({
          event: 'model_route_unavailable',
          primaryRoute: primaryKey,
          backupRoute: backupKey,
          primaryReason: primaryFailure?.reason ?? skipReason ?? null,
          backupReason: classifyModelError(error).reason,
        }),
      );
      throw new AgentError(ErrorCode.MODEL_ERROR, MODEL_BUSY_USER_MESSAGE, true);
    }
  }

  private async runRecoveryProbe(
    provider: ModelProvider,
    providerId: string,
    model: string,
    request: ModelGenerateRequest,
    executionSignal?: AbortSignal,
  ): Promise<boolean> {
    this.throwIfAgentAborted(executionSignal);
    if (this.resolveAttemptTimeoutMs('probe') == null) {
      return false;
    }
    const routeKey = modelRouteKey(providerId, model);
    try {
      await this.invokeOnce(
        provider,
        providerId,
        {
          provider: providerId,
          model,
          agentId: request.agentId,
          tenantId: request.tenantId,
          timeoutMs: request.timeoutMs,
          maxTokens: 32,
          temperature: 0,
          systemPrompt: 'You are a connectivity test.',
          prompt: 'Reply with exactly: OK',
        },
        {
          callKind: 'RECOVERY_PROBE',
          role: 'probe',
          routeKey,
          selectedRoute: routeKey,
          forceNewAttemptKey: true,
        },
      );
      return true;
    } catch (error) {
      if (executionSignal?.aborted || isAgentExecutionAborted()) {
        return false;
      }
      this.logger.warn(
        JSON.stringify({
          event: 'model_recovery_probe_failed',
          routeKey,
          reason: classifyModelError(error).reason,
        }),
      );
      return false;
    }
  }

  private async invokeOnce(
    provider: ModelProvider,
    providerId: string,
    request: ModelGenerateRequest,
    meta: RouteAttemptMeta,
  ): Promise<ModelGenerateResult> {
    const resolvedTimeout = this.resolveAttemptTimeoutMs(meta.role ?? 'single');
    if (resolvedTimeout == null) {
      this.throwIfInsufficientBudget(meta.role ?? 'single');
      throw new AgentError(ErrorCode.AGENT_TIMEOUT, undefined, true);
    }
    const timeoutMs = resolvedTimeout;
    const routeController = new AbortController();
    const agentSignal = getAgentExecutionAbortSignal();
    const abortRoute = () => {
      if (!routeController.signal.aborted) {
        routeController.abort();
      }
    };
    agentSignal?.addEventListener('abort', abortRoute, { once: true });
    const timer = setTimeout(abortRoute, timeoutMs);
    const timedRequest: ModelGenerateRequest = {
      ...request,
      timeoutMs,
      abortSignal: routeController.signal,
    };
    const invoke = async () => {
      try {
        return await this.raceRouteAttempt(provider, timedRequest, routeController);
      } catch (error) {
        this.throwIfAgentAborted(agentSignal, error);
        if (routeController.signal.aborted) {
          if (error instanceof AgentError && error.code === ErrorCode.MODEL_TIMEOUT) {
            throw error;
          }
          throw new AgentError(ErrorCode.MODEL_TIMEOUT, undefined, true);
        }
        if (error instanceof AgentError) {
          throw error;
        }
        throw new AgentError(ErrorCode.MODEL_ERROR, 'Model generation failed', true);
      }
    };
    try {
      const scope = getMeteringScope();
      if (!scope || !this.metering) {
        return await invoke();
      }
      const prompt = request.prompt || JSON.stringify(request.messages ?? []);
      const operation =
        request.agentId === 'script.generation'
          ? UsageOperationType.SCRIPT_GENERATION
          : request.agentId === 'reference.analysis'
            ? UsageOperationType.REFERENCE_ANALYSIS
            : UsageOperationType.AGENT_RUN;
      const attemptKey = meta.forceNewAttemptKey ? randomUUID() : scope.attemptKey?.trim() || randomUUID();
      const model = request.model;
      return await withUsageMetering(
        this.metering,
        {
          ...scope,
          operationType: operation,
          provider: providerId,
          model,
          resourceType: UsageResourceType.LLM,
          idempotencyKey: usageIdempotencyKey([
            'llm',
            scope.agentRunId ?? request.tenantId,
            request.agentId,
            promptFingerprint(prompt),
            'attempt',
            attemptKey,
          ]),
          metadata: {
            stage: scope.stage ?? 'AGENT',
            generationVersion: scope.generationVersion ?? '',
            callKind: meta.callKind,
            billable: providerId !== 'mock',
            attempt: attemptKey,
            routeKey: meta.routeKey ?? null,
            model: model ?? null,
            fallbackUsed: meta.fallbackUsed ?? false,
            failoverReason: meta.failoverReason ?? null,
            primaryFailureReason: meta.primaryFailureReason ?? null,
            primarySkipped: meta.primarySkipped ?? false,
            skipReason: meta.skipReason ?? null,
            selectedRoute: meta.selectedRoute ?? null,
          },
        },
        invoke,
        (result) => ({
          inputUnits: result.usage.inputTokens,
          outputUnits: result.usage.outputTokens,
          totalUnits: result.usage.totalTokens,
          unitType: UsageUnitType.TOKENS,
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async raceRouteAttempt(
    provider: ModelProvider,
    request: ModelGenerateRequest,
    routeController: AbortController,
  ): Promise<ModelGenerateResult> {
    const aborted = new Promise<never>((_, reject) => {
      const fail = () => {
        if (isAgentExecutionAborted()) {
          reject(new AgentError(ErrorCode.AGENT_TIMEOUT, undefined, true));
          return;
        }
        reject(new AgentError(ErrorCode.MODEL_TIMEOUT, undefined, true));
      };
      if (routeController.signal.aborted) {
        fail();
        return;
      }
      routeController.signal.addEventListener('abort', fail, { once: true });
    });
    return Promise.race([provider.generate(request), aborted]);
  }

  private resolveAttemptTimeoutMs(role: NonNullable<RouteAttemptMeta['role']>): number | null {
    const config = readModelRouteTimeoutConfig();
    const configured = role === 'backup' || role === 'probe' ? config.backupMs : config.primaryMs;
    const remaining = remainingAgentBudgetMs();
    if (remaining === undefined) {
      return configured;
    }
    if (remaining < MIN_ROUTE_ATTEMPT_MS) {
      return null;
    }
    return Math.min(configured, remaining);
  }

  private throwIfInsufficientBudget(role: NonNullable<RouteAttemptMeta['role']> | 'backup' | 'primary'): void {
    this.throwIfAgentAborted(getAgentExecutionAbortSignal());
    if (this.resolveAttemptTimeoutMs(role === 'backup' ? 'backup' : role === 'probe' ? 'probe' : role) == null) {
      throw new AgentError(ErrorCode.AGENT_TIMEOUT, undefined, true);
    }
  }

  private tryLockProbe(): boolean {
    if (this.probeLocked) {
      return false;
    }
    this.probeLocked = true;
    return true;
  }

  private throwIfAgentAborted(signal?: AbortSignal, error?: unknown): void {
    if (!signal?.aborted && !isAgentExecutionAborted()) {
      return;
    }
    if (error instanceof AgentError && error.code === ErrorCode.AGENT_TIMEOUT) {
      throw error;
    }
    throw new AgentError(ErrorCode.AGENT_TIMEOUT, undefined, true);
  }
}
