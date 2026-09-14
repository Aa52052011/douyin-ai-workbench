export const SYNTHETIC_VISION_FIXTURES = [
  'product_ui',
  'product_top_navigation',
  'browser_chrome',
  'localhost_dev_label',
  'watermark',
  'email_privacy',
  'small_chinese_text',
  'ambiguous_top_strip',
  'multi_frame_persistence',
  'mock_placeholder_labels',
] as const;

export const VALIDATION_LADDER = [
  'synthetic_fixtures',
  'non_sensitive_internal_ui',
  'content01_selected_frames',
  'old_contaminated_asset_comparison',
] as const;

export const EVALUATION_METRICS = [
  'schemaPassRate',
  'observationPrecision',
  'observationRecall',
  'regionIoU',
  'textAccuracy',
  'decisionLeakageRate',
  'falseBrowserChromeRate',
  'falsePrivacyRate',
  'latency',
  'cost',
] as const;

export const SMOKE_MODULE_ROLLOUT = [
  'UI_STRUCTURE',
  'TEXT_EVIDENCE',
  'DEVELOPER_ARTIFACT',
  'PRIVACY',
  'WATERMARK',
  'AUTHENTICITY',
] as const;

export const PROMPT_FORBIDDEN = [
  'Do not decide asset usage.',
  'Do not recommend final crop.',
  'Do not declare REAL/FAKE.',
  'Do not infer project relevance as final truth.',
] as const;

export const REAL_ADAPTER_IMPLEMENTATION_PLAN = [
  'transport adapter',
  'image payload conversion',
  'prompt builder',
  'structured result parser',
  'single-image mock',
  'single-image real smoke',
  'multi-frame smoke',
  'fallback',
] as const;
