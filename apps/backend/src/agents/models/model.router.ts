import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { MockModelProvider } from './mock.provider.js';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

/**
 * Agent 只通过 ModelRouter.generate() 访问模型。
 * V1 仅 Mock。未来可按 Agent / Tenant / Subscription / Task 选择 provider。
 */
@Injectable()
export class ModelRouter {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly defaultProviderId: string;

  constructor(mock: MockModelProvider) {
    this.register(mock);
    this.defaultProviderId = mock.id;
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
