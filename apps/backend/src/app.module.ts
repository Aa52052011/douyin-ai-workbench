import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { ContentPlansModule } from './content-plans/content-plans.module.js';
import { ScriptsModule } from './scripts/scripts.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { VideosModule } from './videos/videos.module.js';
import { VideoGenerationModule } from './videos/video-generation.module.js';
import { PublishingModule } from './publishing/publishing.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { MarketModule } from './market/market.module.js';
import { CampaignModule } from './campaign/campaign.module.js';
import { IntakeModule } from './intake/intake.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    AgentsModule,
    ContentPlansModule,
    ScriptsModule,
    AssetsModule,
    VideosModule,
    VideoGenerationModule,
    PublishingModule,
    MetricsModule,
    MarketModule,
    CampaignModule,
    IntakeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
