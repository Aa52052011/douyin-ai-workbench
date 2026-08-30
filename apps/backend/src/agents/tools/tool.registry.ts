import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import type { AgentContext } from '../agent.types.js';
import { echoTool } from './echo.tool.js';
import type { AgentTool } from './tool.types.js';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor() {
    this.register(echoTool);
  }

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  async invoke(name: string, input: unknown, context: AgentContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new AgentError(ErrorCode.TOOL_ERROR, `Tool ${name} is not registered`);
    }
    try {
      return await tool.execute(input, context);
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError(ErrorCode.TOOL_ERROR, 'Tool execution failed');
    }
  }
}
