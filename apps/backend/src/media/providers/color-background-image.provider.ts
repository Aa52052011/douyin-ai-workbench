import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service.js';
import type { ImageGenerateRequest, ImageGenerateResult, ImageProvider } from './media-provider.types.js';
import { encodeSolidPng, rgbFromSeed } from '../visual/color-background-png.js';
import {
  COLOR_BACKGROUND_HEIGHT,
  COLOR_BACKGROUND_WIDTH,
  IMAGE_PROVIDER_COLOR_BACKGROUND,
} from '../visual/visual-config.js';

@Injectable()
export class ColorBackgroundImageProvider implements ImageProvider {
  readonly id = IMAGE_PROVIDER_COLOR_BACKGROUND;
  readonly capabilities = { image: true as const, async: false as const };

  constructor(private readonly storage: StorageService) {}

  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const width = evenDimension(request.width, COLOR_BACKGROUND_WIDTH);
    const height = evenDimension(request.height, COLOR_BACKGROUND_HEIGHT);
    const body = encodeSolidPng(width, height, rgbFromSeed(request.sceneId || request.storageKey));
    const stored = await this.storage.put(request.storageKey, body, { mimeType: 'image/png' });
    return {
      storageKey: stored.key,
      mimeType: 'image/png',
      size: stored.size,
      width,
      height,
      provider: this.id,
      model: 'color-background-v1',
      usage: { provider: this.id, model: 'color-background-v1' },
    };
  }
}

function evenDimension(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || !value || value < 16) {
    return fallback;
  }
  return value % 2 === 0 ? value : value - 1;
}
