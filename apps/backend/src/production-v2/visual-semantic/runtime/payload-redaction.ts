import type { MultimodalContentPart, MultimodalMessage } from './multimodal.types.js';

export function serializeChatMessages(
  messages: MultimodalMessage[],
  extraImages: Array<{ type: 'image_url'; image_url: { url: string } }>,
): Array<{ role: string; content: string | MultimodalContentPart[] }> {
  const serialized = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  if (extraImages.length === 0) {
    return serialized;
  }
  const lastUser = [...serialized].reverse().find((item) => item.role === 'user');
  if (!lastUser) {
    serialized.push({
      role: 'user',
      content: extraImages,
    });
    return serialized;
  }
  if (typeof lastUser.content === 'string') {
    lastUser.content = [{ type: 'text', text: lastUser.content }, ...extraImages];
    return serialized;
  }
  lastUser.content = [...lastUser.content, ...extraImages];
  return serialized;
}

export function countImageParts(messages: ReturnType<typeof serializeChatMessages>): number {
  let count = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      continue;
    }
    count += message.content.filter((part) => part.type === 'image_url').length;
  }
  return count;
}

export function totalImageBytesFromDataUrls(messages: ReturnType<typeof serializeChatMessages>): number {
  let bytes = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== 'image_url') {
        continue;
      }
      const url = part.image_url.url;
      const comma = url.indexOf(',');
      if (url.startsWith('data:') && comma >= 0) {
        bytes += Math.floor((url.length - comma - 1) * 0.75);
      }
    }
  }
  return bytes;
}

export function sanitizeRequestLog(input: {
  requestId: string;
  model: string;
  numberOfImages: number;
  totalImageBytes: number;
  timeoutMs: number;
  responseFormat: string;
}): Record<string, string | number> {
  return {
    requestId: input.requestId,
    model: input.model,
    numberOfImages: input.numberOfImages,
    totalImageBytes: input.totalImageBytes,
    timeout: input.timeoutMs,
    responseFormat: input.responseFormat,
  };
}

export function stripSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, 'data:image/[redacted]');
}
