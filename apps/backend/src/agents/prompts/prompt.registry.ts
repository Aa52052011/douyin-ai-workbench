import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { ECHO_AGENT_ID, ECHO_AGENT_VERSION } from '../agent.types.js';
import { accountPositioningPromptV1 } from './account-positioning.prompt.js';
import { campaignStrategyPromptV1 } from './campaign-strategy.prompt.js';
import { contentPlanningPromptV1 } from './content-planning.prompt.js';
import { marketIntelligencePromptV1 } from './market-intelligence.prompt.js';
import { marketIntakePromptV1 } from './market-intake.prompt.js';
import { productIntakePromptV1 } from './product-intake.prompt.js';
import { performanceAnalysisPromptV1 } from './performance-analysis.prompt.js';
import { productionQualityPromptV1 } from './production-quality.prompt.js';
import { referenceAnalysisPromptV1 } from './reference-analysis.prompt.js';
import { scriptGenerationPromptV1 } from './script-generation.prompt.js';
import type { PromptTemplate, RenderedPrompt } from './prompt.types.js';

@Injectable()
export class PromptRegistry {
  private readonly templates = new Map<string, PromptTemplate>();

  constructor() {
    this.register({
      name: ECHO_AGENT_ID,
      version: ECHO_AGENT_VERSION,
      systemPrompt: 'You are system.echo. Repeat the user message. Do not call external models.',
      userPromptTemplate: '{{message}}',
    });
    this.register(accountPositioningPromptV1);
    this.register(contentPlanningPromptV1);
    this.register(scriptGenerationPromptV1);
    this.register(marketIntelligencePromptV1);
    this.register(campaignStrategyPromptV1);
    this.register(productIntakePromptV1);
    this.register(marketIntakePromptV1);
    this.register(referenceAnalysisPromptV1);
    this.register(productionQualityPromptV1);
    this.register(performanceAnalysisPromptV1);
  }

  register(template: PromptTemplate): void {
    this.templates.set(keyOf(template.name, template.version), template);
  }

  get(name: string, version: string): PromptTemplate {
    const found = this.templates.get(keyOf(name, version));
    if (!found) {
      throw new AgentError(ErrorCode.AGENT_NOT_FOUND, `Prompt ${name}:${version} is not registered`);
    }
    return found;
  }

  render(name: string, version: string, vars: Record<string, string>): RenderedPrompt {
    const template = this.get(name, version);
    return {
      name: template.name,
      version: template.version,
      systemPrompt: template.systemPrompt,
      userPrompt: renderTemplate(template.userPromptTemplate, vars),
    };
  }
}

function keyOf(name: string, version: string): string {
  return `${name}:${version}`;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}
