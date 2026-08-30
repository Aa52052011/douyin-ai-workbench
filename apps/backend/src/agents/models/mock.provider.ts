import { Injectable } from '@nestjs/common';
import type { ModelGenerateRequest, ModelGenerateResult, ModelProvider } from './model.types.js';

@Injectable()
export class MockModelProvider implements ModelProvider {
  readonly id = 'mock';

  async generate(request: ModelGenerateRequest): Promise<ModelGenerateResult> {
    const text = request.prompt;
    const inputTokens = tokenEstimate(`${request.systemPrompt ?? ''}\n${request.prompt}`);
    const outputTokens = tokenEstimate(text);
    return {
      text,
      provider: this.id,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCost: 0,
      },
    };
  }
}

function tokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
