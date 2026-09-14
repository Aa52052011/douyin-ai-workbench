import type { DocSnapshot } from './evidence-levels.js';

export const RETRIEVED_AT = '2026-09-11';

export const ROUTER_DOC_SNAPSHOTS: DocSnapshot[] = [
  {
    title: 'Router One API Compatibility Facts',
    source: 'https://router.one/facts/api-compatibility.md',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'router-vision-flag-and-chat-wire-format',
    summary:
      'POST /v1/chat/completions uses OpenAI Chat Completions wire format for every chat catalog model. Vision input is a per-model catalog flag; models.md is source of truth. json_object and json_schema envelopes are accepted at the gateway. No advertised cross-protocol translation beyond listed endpoints.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Vision is a catalog capability on the OpenAI-compatible chat endpoint; structured-output envelopes are gateway-accepted.',
  },
  {
    title: 'Router One Models (English catalog)',
    source: 'https://router.one/models.md',
    sourceType: 'official-catalog',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'model-ids-and-vision-flags',
    summary:
      'Exact ids openai/gpt-5.5 and anthropic/claude-haiku-4.5 are listed. Both carry capabilities including vision. Catalog also lists other vision chat models with posted USD token prices and context windows.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Configured primary and backup model IDs exist in the live catalog and are tagged vision.',
  },
  {
    title: 'Create Chat Completion',
    source: 'https://router.one/docs/chat/createChatCompletion',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'chat-completions-schema',
    summary:
      'Documents model ids including openai/gpt-5.5, messages array, and response_format json_object/json_schema envelope checks. Published example uses string content, not image parts.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Chat Completions request contract exists; published example does not prove image_url schema.',
  },
  {
    title: 'Gemini API in China',
    source: 'https://router.one/gemini-api-china',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'image_url-content-parts',
    summary:
      'FAQ: call Gemini through the OpenAI-compatible interface. Vision input works via standard image_url content parts.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Router One documents image_url content parts as the vision wire format on the shared OpenAI-compatible endpoint.',
  },
  {
    title: 'Grok API in China',
    source: 'https://router.one/grok-api-china',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'image_url-content-parts',
    summary: 'FAQ: Vision input on grok-4.6 and grok-4.5 works via standard image_url content parts.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Router One documents image_url content parts for named vision Grok ids on the same chat endpoint.',
  },
  {
    title: 'OpenAI-Compatible API',
    source: 'https://router.one/openai-compatible-api',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'openai-compatible-contract',
    summary:
      'Implements OpenAI Chat Completions at https://api.router.one/v1. Streaming, tools, and response_format travel on the same request shape; support varies by model.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Drop-in OpenAI Chat Completions compatibility is documented; vision is not restated on this page.',
  },
  {
    title: 'Structured outputs',
    source: 'https://router.one/llm-structured-outputs',
    sourceType: 'official-docs',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'json_object-json_schema',
    summary:
      'Gateway accepts json_object and json_schema, validates envelope before any model call, forwards unchanged. Schema enforcement is per-model. Catalog has no structured-outputs flag.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Router transport supports json_object and json_schema envelopes; model enforcement is not catalog-guaranteed.',
  },
  {
    title: 'gpt-5.5 model page',
    source: 'https://router.one/models/gpt-5-5',
    sourceType: 'official-catalog',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'openai/gpt-5.5',
    summary:
      'Model ID openai/gpt-5.5. Endpoints include POST /v1/chat/completions. Posted token prices and ~1.05M context. Glance copy calls it a GPT-series text model; vision is not restated on this page (catalog table is source of truth for vision).',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Exact model ID and chat endpoint are listed; this page alone does not document image_url.',
  },
  {
    title: 'claude-haiku-4.5 model page',
    source: 'https://router.one/models/claude-haiku-4-5',
    sourceType: 'official-catalog',
    retrievedAt: RETRIEVED_AT,
    relevantCapability: 'anthropic/claude-haiku-4.5',
    summary:
      'Model ID anthropic/claude-haiku-4.5 on chat/completions and messages. Glance: accepts text, image; returns text. Posted token prices and 200K context.',
    evidenceLevel: 'DOCUMENTED',
    claim: 'Exact backup ID is listed and the detail page states image input is accepted.',
  },
];
