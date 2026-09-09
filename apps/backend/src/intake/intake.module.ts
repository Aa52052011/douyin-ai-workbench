import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { MarketModule } from '../market/market.module.js';
import { MarketIntakeController } from './market-intake.controller.js';
import { MarketIntakeTurnService } from './market-intake-turn.service.js';
import { ProductIntakeController } from './product-intake.controller.js';
import { ProductIntakeTurnService } from './product-intake-turn.service.js';

@Module({
  imports: [AuthModule, AuthzModule, AgentsModule, MarketModule],
  controllers: [ProductIntakeController, MarketIntakeController],
  providers: [ProductIntakeTurnService, MarketIntakeTurnService],
})
export class IntakeModule {}
