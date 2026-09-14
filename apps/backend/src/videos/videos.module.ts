import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { AccountMemoryModule } from '../memory/account-memory.module.js';
import { MarketModule } from '../market/market.module.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';
import { VideoGenerationModule } from './video-generation.module.js';
import { ProductionDirectorService } from './director/production-director.service.js';

@Module({
  imports: [AuthModule, AuthzModule, VideoGenerationModule, AccountMemoryModule, MarketModule],
  controllers: [VideosController],
  providers: [VideosService, ProductionDirectorService],
  exports: [VideoGenerationModule, ProductionDirectorService],
})
export class VideosModule {}
