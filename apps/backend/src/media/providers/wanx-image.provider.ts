import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';
import { StorageService } from '../storage/storage.service.js';
import type { ImageGenerateRequest, ImageGenerateResult, ImageProvider } from './media-provider.types.js';
import { assertValidVisualImage } from '../visual/image-format.js';
import {
  classifyVisualHttpStatus,
  classifyWanxVendorCode,
  isAbortError,
  readLimitedResponseBody,
  sanitizeVisualError,
  visualError,
} from '../visual/visual-errors.js';
import {
  assertWanxImageConfigured,
  clipWanxPrompt,
  IMAGE_PROVIDER_WANX,
  joinWanxGenerationUrl,
  readWanxImageConfig,
  WANX_CAPABILITIES,
  WANX_DOWNLOAD_ATTEMPTS,
  WANX_NEGATIVE_PROMPT_MAX_CHARS,
  WANX_PROMPT_MAX_CHARS,
  type WanxImageConfig,
} from '../visual/wanx-config.js';

export type WanxFetch = typeof fetch;

type WanxSyncResponse = {
  output?: {
    finished?: boolean;
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: Array<{ image?: string; type?: string }> };
    }>;
  };
  usage?: { image_count?: number; size?: string };
  request_id?: string;
  code?: string;
  message?: string;
};

@Injectable()
export class WanxImageProvider implements ImageProvider {
  readonly id = IMAGE_PROVIDER_WANX;
  readonly capabilities = WANX_CAPABILITIES;
  private readonly logger = new Logger(WanxImageProvider.name);

  constructor(private readonly storage: StorageService) {}

  get model(): string {
    return readWanxImageConfig().model;
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    return this.generateWith(request, globalThis.fetch.bind(globalThis));
  }

  async generateWith(request: ImageGenerateRequest, fetchImpl: WanxFetch): Promise<ImageGenerateResult> {
    const config = assertWanxImageConfigured(readWanxImageConfig());
    const prompt = clipWanxPrompt(request.prompt.trim(), WANX_PROMPT_MAX_CHARS);
    if (!prompt) {
      throw visualError(ErrorCode.VISUAL_PROVIDER_BAD_REQUEST);
    }
    let generationPosted = false;
    try {
      const generated = await postWanxGeneration(config, request, prompt, fetchImpl, () => {
        generationPosted = true;
      });
      const body = await downloadWanxImage(generated.imageUrl, config, fetchImpl);
      const image = assertValidVisualImage(body);
      try {
        const stored = await this.storage.put(request.storageKey, body, { mimeType: image.mimeType });
        return {
          storageKey: stored.key,
          mimeType: image.mimeType,
          size: stored.size,
          width: image.width,
          height: image.height,
          provider: this.id,
          model: config.model,
          providerTaskId: generated.requestId,
          usage: {
            provider: this.id,
            model: config.model,
            imageCount: generated.imageCount,
            providerTaskId: generated.requestId,
          },
        };
      } catch (error) {
        await this.storage.delete(request.storageKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED) {
        throw error;
      }
      if (error instanceof AppError && error.code === ErrorCode.VISUAL_PROVIDER_BAD_REQUEST && !generationPosted) {
        throw new AppError(error.code);
      }
      this.logger.warn({
        event: 'wanx_generate_failed',
        code: error instanceof AppError ? error.code : 'UNKNOWN',
        afterGenerationPost: generationPosted,
      });
      throw sanitizeVisualError(error, generationPosted);
    }
  }
}

export async function postWanxGeneration(
  config: WanxImageConfig,
  request: ImageGenerateRequest,
  prompt: string,
  fetchImpl: WanxFetch,
  markPosted: () => void,
): Promise<{ imageUrl: string; requestId?: string; imageCount: number; size?: string }> {
  const url = joinWanxGenerationUrl(config.baseUrl);
  const payload = JSON.stringify({
    model: config.model,
    input: {
      messages: [{ role: 'user', content: [{ text: prompt }] }],
    },
    parameters: {
      n: 1,
      prompt_extend: false,
      watermark: false,
      size: config.size,
      ...(request.negativePrompt?.trim()
        ? { negative_prompt: clipWanxPrompt(request.negativePrompt.trim(), WANX_NEGATIVE_PROMPT_MAX_CHARS) }
        : {}),
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  markPosted();
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: payload,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw visualError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING);
  }
  clearTimeout(timer);
  const failCode = response.ok || response.status >= 500
    ? ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING
    : ErrorCode.VISUAL_PROVIDER_INVALID_RESPONSE;
  const raw = await readLimitedResponseBody(response, config.maxResponseBytes, failCode);
  const text = raw.toString('utf8');
  let parsed: WanxSyncResponse | null = null;
  try {
    parsed = JSON.parse(text) as WanxSyncResponse;
  } catch {
    if (response.ok || response.status >= 500) {
      throw visualError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING);
    }
    throw visualError(classifyVisualHttpStatus(response.status, '', text));
  }
  const vendorCode = typeof parsed.code === 'string' ? parsed.code : '';
  const vendorMessage = typeof parsed.message === 'string' ? parsed.message : '';
  if (!response.ok || vendorCode) {
    const mapped =
      classifyWanxVendorCode(vendorCode, vendorMessage) ??
      classifyVisualHttpStatus(response.status, vendorCode, text);
    throw visualError(mapped);
  }
  const imageUrl = extractWanxImageUrl(parsed);
  if (!imageUrl) {
    throw visualError(ErrorCode.VISUAL_PROVIDER_UNKNOWN_BILLING);
  }
  return {
    imageUrl,
    requestId: typeof parsed.request_id === 'string' ? parsed.request_id : undefined,
    imageCount: Number.isInteger(parsed.usage?.image_count) ? Number(parsed.usage?.image_count) : 1,
    size: parsed.usage?.size,
  };
}

export async function downloadWanxImage(imageUrl: string, config: WanxImageConfig, fetchImpl: WanxFetch): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < WANX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(imageUrl, { method: 'GET', signal: controller.signal });
      if (!response.ok) {
        throw visualError(ErrorCode.VISUAL_PROVIDER_DOWNLOAD);
      }
      const body = await readLimitedResponseBody(response, config.maxResponseBytes, ErrorCode.VISUAL_PROVIDER_DOWNLOAD);
      clearTimeout(timer);
      return body;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (isAbortError(error)) {
        lastError = visualError(ErrorCode.VISUAL_PROVIDER_DOWNLOAD);
      }
    }
  }
  if (lastError instanceof AppError) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_DOWNLOAD);
  }
  throw visualError(ErrorCode.VISUAL_PROVIDER_DOWNLOAD);
}

function extractWanxImageUrl(parsed: WanxSyncResponse): string | null {
  const content = parsed.output?.choices?.[0]?.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }
  for (const item of content) {
    if (typeof item?.image === 'string' && item.image.startsWith('https://')) {
      return item.image;
    }
  }
  return null;
}
