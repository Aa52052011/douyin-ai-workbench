import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../common/errors/app-error.js';
import { accountPositioningDefinition } from './definitions/account-positioning.agent.js';
import { campaignStrategyDefinition } from './definitions/campaign-strategy.agent.js';
import { contentPlanningDefinition } from './definitions/content-planning.agent.js';
import { marketIntelligenceDefinition } from './definitions/market-intelligence.agent.js';
import { scriptGenerationDefinition } from './definitions/script-generation.agent.js';
import { systemEchoDefinition } from './definitions/system-echo.agent.js';
import { AgentError } from './agent.errors.js';
import type { AgentDefinition } from './agent.types.js';

@Injectable()
export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition>();

  constructor() {
    this.register(systemEchoDefinition);
    this.register(accountPositioningDefinition);
    this.register(contentPlanningDefinition);
    this.register(scriptGenerationDefinition);
    this.register(marketIntelligenceDefinition);
    this.register(campaignStrategyDefinition);
  }

  register(definition: AgentDefinition): void {
    this.agents.set(keyOf(definition.id, definition.version), definition);
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  get(id: string, version?: string): AgentDefinition {
    if (version) {
      const found = this.agents.get(keyOf(id, version));
      if (!found) {
        throw new AgentError(ErrorCode.AGENT_NOT_FOUND);
      }
      return found;
    }
    const matches = this.list().filter((item) => item.id === id);
    if (matches.length === 0) {
      throw new AgentError(ErrorCode.AGENT_NOT_FOUND);
    }
    return matches[matches.length - 1];
  }

  has(id: string, version?: string): boolean {
    try {
      this.get(id, version);
      return true;
    } catch {
      return false;
    }
  }
}

function keyOf(id: string, version: string): string {
  return `${id}:${version}`;
}
