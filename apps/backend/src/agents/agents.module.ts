import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { AgentsController } from './agent.controller.js';
import { AgentEngine } from './agent.engine.js';
import { AgentRegistry } from './agent.registry.js';
import { AgentsService } from './agent.service.js';
import { AGENT_EXECUTOR } from './executors/agent.executor.js';
import { AiEngineExecutor } from './executors/ai-engine.executor.js';
import { InProcessAgentExecutor } from './executors/in-process.executor.js';
import { MockModelProvider } from './models/mock.provider.js';
import { ModelRouter } from './models/model.router.js';
import { RealModelProvider } from './models/real.provider.js';
import { PromptRegistry } from './prompts/prompt.registry.js';
import { ToolRegistry } from './tools/tool.registry.js';
import { EmptyTrendDataProvider } from './trends/empty-trend-data.provider.js';

@Module({
  imports: [AuthModule, AuthzModule, MetricsModule],
  controllers: [AgentsController],
  providers: [
    AgentRegistry,
    PromptRegistry,
    ToolRegistry,
    EmptyTrendDataProvider,
    MockModelProvider,
    RealModelProvider,
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
  exports: [AgentsService, MockModelProvider],
})
export class AgentsModule {}
