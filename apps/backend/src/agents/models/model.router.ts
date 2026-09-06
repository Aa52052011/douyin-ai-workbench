import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { resolveModelProviderId } from './model.config.js';
import { MockModelProvider } from './mock.provider.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';
import { RealModelProvider } from './real.provider.js';

/**
 * Agent 只通过 ModelRouter.generate() 访问模型。
 * test 强制 mock；development/production 必须显式 MODEL_PROVIDER。
 */
@Injectable()
export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly defaultProviderId: string;

  constructor(mock: MockModelProvider, real: RealModelProvider) {
    this.register(mock);
    this.register(real);
    this.defaultProviderId = resolveModelProviderId();
  }

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const providerId = request.provider ?? this.defaultProviderId;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new AgentError(ErrorCode.MODEL_ERROR, `Model provider ${providerId} is not configured`);
    }
    try {
      return await provider.generate(request);
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError(ErrorCode.MODEL_ERROR, 'Model generation failed', true);
    }
  }
}
