export const MARKET_ALLOWED_PLATFORMS = ['douyin'] as const;

export const MARKET_WRITABLE_SOURCES = ['MANUAL', 'IMPORT'] as const;

export const MARKET_SOURCES = [
  'DOUYIN_OFFICIAL',
  'IMPORT',
  'MANUAL',
  'DESKTOP_ASSISTED',
  'THIRD_PARTY',
] as const;

export const MARKET_ITEM_KINDS = [
  'KEYWORD',
  'CONTENT',
  'COMPETITOR',
  'TREND',
  'AUDIENCE_SIGNAL',
] as const;

export const MARKET_MAX_ITEMS = 200;
export const MARKET_MAX_JSON_BYTES = 256 * 1024;

export const MARKET_MAX_PER_KIND = {
  KEYWORD: 80,
  CONTENT: 80,
  COMPETITOR: 40,
  TREND: 40,
  AUDIENCE_SIGNAL: 40,
} as const;

export const MARKET_STRING_LIMITS = {
  keyword: 80,
  displayName: 120,
  title: 200,
  caption: 2000,
  author: 120,
  topic: 120,
  name: 120,
  category: 80,
  signalType: 80,
  pageContext: 200,
  importFileFingerprint: 128,
  providerRequestId: 120,
  externalId: 120,
  url: 500,
  example: 200,
} as const;

export const MARKET_MAX_RELATED_KEYWORDS = 20;
export const MARKET_MAX_HASHTAGS = 20;
export const MARKET_MAX_CONTENT_KEYWORDS = 20;
export const MARKET_MAX_CONTENT_THEMES = 12;
export const MARKET_MAX_AUDIENCE_EXAMPLES = 5;

export const MARKET_VOLUME_SIGNALS = ['low', 'medium', 'high'] as const;
export const MARKET_COMPETITION_SIGNALS = ['low', 'medium', 'high'] as const;
export const MARKET_FREQUENCY_SIGNALS = ['low', 'medium', 'high'] as const;
export const MARKET_ENGAGEMENT_SIGNALS = ['low', 'medium', 'high'] as const;
export const MARKET_HEAT_SIGNALS = ['low', 'medium', 'high'] as const;

export const MARKET_FORBIDDEN_SECRET_KEYS = [
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'cookie',
  'Cookie',
  'authorization',
  'Authorization',
  'credentialRef',
  'password',
  'secret',
  'clientSecret',
  'rawHtml',
  'rawHTML',
  'headers',
  'credentials',
] as const;

export const MARKET_AUDIENCE_FORBIDDEN_KEYS = [
  'userId',
  'username',
  'avatar',
  'profileUrl',
  'privateMessage',
] as const;

export const PRODUCT_BRIEF_LIMITS = {
  productName: 120,
  category: 80,
  industry: 80,
  brand: 80,
  description: 2000,
  sellingPoint: 200,
  targetAudience: 500,
  priceRange: 80,
  businessGoal: 500,
  conversionGoal: 500,
  constraint: 200,
  tone: 80,
  competitor: 120,
  seedKeyword: 80,
  sellingPoints: 12,
  constraints: 12,
  referenceCompetitors: 20,
  seedKeywords: 30,
} as const;
