import { Module } from '@nestjs/common';
import { JobProcessor } from '../jobs/job.processor.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MediaModule } from '../media/media.module.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { PublishingModule } from '../publishing/publishing.module.js';
import { CompositionStage } from './pipeline/stages/compose.stage.js';
import { SubtitleGenerationStage } from './pipeline/stages/subtitle.stage.js';
import { VisualGenerationStage } from './pipeline/stages/visual.stage.js';
import { VoiceGenerationStage } from './pipeline/stages/voice.stage.js';
import { VideoGenerationService } from './video-generation.service.js';

@Module({
  imports: [MediaModule, JobsModule, PublishingModule, MetricsModule],
  providers: [
    VisualGenerationStage,
    VoiceGenerationStage,
    SubtitleGenerationStage,
    CompositionStage,
    VideoGenerationService,
    JobProcessor,
  ],
  exports: [VideoGenerationService, JobProcessor, JobsModule, MediaModule],
})
export class VideoGenerationModule {}
