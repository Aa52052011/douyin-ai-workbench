import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';

const SENSITIVE_KEY =
  /^(password|passwordHash|accessToken|refreshToken|authorization|cookie|token|secret|apiKey)$/i;

export type AgentLogEvent = {
  requestId: string;
  agent: string;
  version: string;
  status: string;
  durationMs?: number;
  errorCode?: string;
  outputIssue?: string;
  promptHash?: string;
  promptLength?: number;
  responseHash?: string;
  responseLength?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export function payloadFingerprint(value: unknown): { hash: string; length: number } {
  const json = stableStringify(value);
  return {
    hash: createHash('sha256').update(json).digest('hex').slice(0, 16),
    length: json.length,
  };
}

export function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = sanitizeForLog(nested);
    }
    return out;
  }
  return value;
}

export function shouldLogFullPrompts(): boolean {
  return process.env.AGENT_DEBUG_PROMPTS === 'true';
}

export class AgentRunLogger {
  private readonly logger = new Logger('AgentEngine');

  log(event: AgentLogEvent): void {
    this.logger.log(event);
  }

  debugPrompt(requestId: string, prompt: unknown, response: unknown): void {
    if (!shouldLogFullPrompts()) {
      return;
    }
    this.logger.debug({
      requestId,
      prompt: sanitizeForLog(prompt),
      response: sanitizeForLog(response),
    });
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(value);
}
