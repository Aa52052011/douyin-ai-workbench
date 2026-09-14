import type { ImageContentPart, MultimodalContentPart } from './multimodal.types.js';

export function buildInterleavedUserContent(
  prompt: string,
  frames: Array<{ frameId: string; dataUrl: string }>,
): MultimodalContentPart[] {
  const parts: MultimodalContentPart[] = [{ type: 'text', text: prompt }];
  for (const frame of frames) {
    parts.push({ type: 'text', text: `FRAME_ID=${frame.frameId}` });
    parts.push({ type: 'image_url', image_url: { url: frame.dataUrl } } satisfies ImageContentPart);
  }
  return parts;
}

export function countInterleavedImages(parts: MultimodalContentPart[]): number {
  return parts.filter((part) => part.type === 'image_url').length;
}
