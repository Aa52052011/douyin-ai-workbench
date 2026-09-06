import { Module } from '@nestjs/common';
import { resolveComposeProviderId } from './ffmpeg/ffmpeg-config.js';
import { ColorBackgroundImageProvider } from './providers/color-background-image.provider.js';
import { COMPOSE_PROVIDER } from './providers/compose.token.js';
import { IMAGE_PROVIDER } from './providers/image.token.js';
import { TTS_PROVIDER } from './providers/tts.token.js';
import { FfmpegComposeProvider } from './providers/ffmpeg-compose.provider.js';
import { MockComposeProvider } from './providers/mock-compose.provider.js';
import { MockSubtitleProvider } from './providers/mock-subtitle.provider.js';
import { MockTtsProvider } from './providers/mock-tts.provider.js';
import { MockVideoProvider } from './providers/mock-video.provider.js';
import { MiniMaxTtsProvider } from './providers/minimax-tts.provider.js';
import { OpenAiTtsProvider } from './providers/openai-tts.provider.js';
import { WanxImageProvider } from './providers/wanx-image.provider.js';
import { LocalStorageProvider } from './storage/local-storage.provider.js';
import { StorageService } from './storage/storage.service.js';
import { assertMiniMaxTtsConfigured, TTS_PROVIDER_MINIMAX } from './tts/minimax-tts-config.js';
import { assertOpenAiTtsConfigured, resolveTtsProviderId, TTS_PROVIDER_OPENAI } from './tts/tts-config.js';
import { IMAGE_PROVIDER_WANX, resolveImageProviderId } from './visual/visual-config.js';
import { assertWanxImageConfigured } from './visual/wanx-config.js';

@Module({
  providers: [
    LocalStorageProvider,
    StorageService,
    MockVideoProvider,
    MockTtsProvider,
    OpenAiTtsProvider,
    MiniMaxTtsProvider,
    MockSubtitleProvider,
    MockComposeProvider,
    FfmpegComposeProvider,
    ColorBackgroundImageProvider,
    WanxImageProvider,
    {
      provide: IMAGE_PROVIDER,
      useFactory: (color: ColorBackgroundImageProvider, wanx: WanxImageProvider) => {
        const id = resolveImageProviderId();
        if (id === IMAGE_PROVIDER_WANX) {
          assertWanxImageConfigured();
          return wanx;
        }
        return color;
      },
      inject: [ColorBackgroundImageProvider, WanxImageProvider],
    },
    {
      provide: COMPOSE_PROVIDER,
      useFactory: (mock: MockComposeProvider, ffmpeg: FfmpegComposeProvider) =>
        resolveComposeProviderId() === 'ffmpeg' ? ffmpeg : mock,
      inject: [MockComposeProvider, FfmpegComposeProvider],
    },
    {
      provide: TTS_PROVIDER,
      useFactory: (mock: MockTtsProvider, openai: OpenAiTtsProvider, minimax: MiniMaxTtsProvider) => {
        const id = resolveTtsProviderId();
        if (id === TTS_PROVIDER_OPENAI) {
          assertOpenAiTtsConfigured();
          return openai;
        }
        if (id === TTS_PROVIDER_MINIMAX) {
          assertMiniMaxTtsConfigured();
          return minimax;
        }
        return mock;
      },
      inject: [MockTtsProvider, OpenAiTtsProvider, MiniMaxTtsProvider],
    },
  ],
  exports: [
    StorageService,
    MockVideoProvider,
    MockTtsProvider,
    OpenAiTtsProvider,
    MiniMaxTtsProvider,
    MockSubtitleProvider,
    MockComposeProvider,
    FfmpegComposeProvider,
    ColorBackgroundImageProvider,
    WanxImageProvider,
    COMPOSE_PROVIDER,
    TTS_PROVIDER,
    IMAGE_PROVIDER,
  ],
})
export class MediaModule {}
