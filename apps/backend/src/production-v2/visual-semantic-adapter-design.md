# Real Vision Provider Adapter Design (B2-3)

Status: DESIGN + VALIDATION ONLY. Vision calls = 0. Real adapter = NOT IMPLEMENTED.

## Architecture

```
VisualSemanticProvider
  → RealVisualSemanticProviderAdapter   (not implemented)
    → MultimodalModelClient             (new; do not reuse ModelGenerateRequest as-is)
      → Existing fetch / AbortSignal / ModelRouter failover / usage attemptKey
```

Do not call axios/fetch from VisualSemanticProvider. Do not patch RealModelProvider text `content: string` in this step.

## Confirmed local facts

- `RealModelProvider` POSTs OpenAI-compatible `/v1/chat/completions`.
- `ModelMessage.content` is `string` only.
- `response_format` supports `json_object` only (not native json_schema).
- `MODEL_PROVIDER=real|router-one` share this client.
- Failover: `MODEL_NAME` + `MODEL_FALLBACK_1_NAME`, circuit breaker, default 135s / 45s.
- `parseModelJson` brace-slice exists for **text agents**; Vision repair must not fabricate observations.

## Unvalidated

- Whether configured `openai/gpt-5.5` or `anthropic/claude-haiku-4.5` accept image parts.
- Whether Router One forwards multimodal `content` arrays.
- Official vendor documentation was not fetched in B2-3 (`DOCUMENTATION_UNVALIDATED`).

## Selection

`VISION_PROVIDER_SELECTION_DECISION.status = BLOCKED_BY_CAPABILITY_UNKNOWN`

Smoke-test *candidates* (not production providers): primary configured text model, backup configured fallback. Both vision = UNVALIDATED.

## Prompt skeleton (not production copy)

BASE: observe only. Forbidden: asset usage, final crop, REAL/FAKE, final project relevance.

Modules versioned separately. Incremental smoke: UI_STRUCTURE → TEXT_EVIDENCE → DEVELOPER_ARTIFACT → PRIVACY → WATERMARK → AUTHENTICITY.

## OCR

Dedicated OCR NOT_REQUIRED_YET. Split `nativeTextReading` vs `dedicatedOCR`.

## Privacy

Future `VISUAL_SEMANTIC_PROVIDER_ENABLED` default false until explicit config/consent. No public upload of user frames. No .env writes in B2-3.
