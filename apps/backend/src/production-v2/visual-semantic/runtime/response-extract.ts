export type AssistantContentInspection = {
  exists: boolean;
  contentType: 'string' | 'array' | 'missing' | 'other';
  text: string;
};

export function inspectAssistantContent(body: unknown): AssistantContentInspection {
  if (!body || typeof body !== 'object') {
    return { exists: false, contentType: 'missing', text: '' };
  }
  const record = body as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = record.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return { exists: content.length > 0, contentType: 'string', text: content };
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
    return { exists: text.length > 0, contentType: 'array', text };
  }
  if (content === undefined || content === null) {
    return { exists: false, contentType: 'missing', text: '' };
  }
  return { exists: false, contentType: 'other', text: '' };
}

export function extractAssistantContent(body: unknown): string {
  return inspectAssistantContent(body).text;
}

export function parseUsage(body: unknown): {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
} {
  if (!body || typeof body !== 'object' || !('usage' in body)) {
    return { prompt_tokens: null, completion_tokens: null, total_tokens: null, cost: null };
  }
  const usage = (body as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: null, completion_tokens: null, total_tokens: null, cost: null };
  }
  const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    prompt_tokens: num(usage.prompt_tokens),
    completion_tokens: num(usage.completion_tokens),
    total_tokens: num(usage.total_tokens),
    cost: num(usage.cost) ?? num(usage.total_cost),
  };
}

export type JsonRepairResult = {
  value: unknown;
  rawSchemaPass: boolean;
  repairUsed: boolean;
};

export function parseJsonObjectWithOptionalFormatRepair(rawText: string): JsonRepairResult {
  const trimmed = rawText.trim();
  try {
    return { value: JSON.parse(trimmed), rawSchemaPass: true, repairUsed: false };
  } catch {
    // format-only recovery
  }
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('JSON_PARSE_FAILED');
  }
  const slice = unfenced.slice(start, end + 1);
  return { value: JSON.parse(slice), rawSchemaPass: false, repairUsed: true };
}
