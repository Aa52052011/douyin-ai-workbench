import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';
import { VideoGenerationModule } from './video-generation.module.js';

@Module({
  imports: [AuthModule, AuthzModule, VideoGenerationModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideoGenerationModule],
})
export class VideosModule {}
