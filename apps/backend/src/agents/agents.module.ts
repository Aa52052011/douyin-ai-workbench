import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { AgentsController } from './agent.controller.js';
import { AgentEngine } from './agent.engine.js';
import { AgentRegistry } from './agent.registry.js';
import { AgentsService } from './agent.service.js';
import { AGENT_EXECUTOR } from './executors/agent.executor.js';
import { AiEngineExecutor } from './executors/ai-engine.executor.js';
import { InProcessAgentExecutor } from './executors/in-process.executor.js';
import { MockModelProvider } from './models/mock.provider.js';
import { ModelRouter } from './models/model.router.js';
import { PromptRegistry } from './prompts/prompt.registry.js';
import { ToolRegistry } from './tools/tool.registry.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [AgentsController],
  providers: [
    AgentRegistry,
    PromptRegistry,
    ToolRegistry,
    MockModelProvider,
    ModelRouter,
    InProcessAgentExecutor,
    AgentsService,
    AgentEngine,
    {
      provide: AGENT_EXECUTOR,
      useFactory: (inProcess: InProcessAgentExecutor) => {
        const url = process.env.AI_ENGINE_URL?.trim();
        if (url) {
          return new AiEngineExecutor(url, process.env.AI_ENGINE_SECRET ?? '');
        }
        return inProcess;
      },
      inject: [InProcessAgentExecutor],
    },
  ],
})
export class AgentsModule {}
