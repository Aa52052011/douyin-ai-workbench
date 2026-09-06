export const LOCAL_STORAGE_PROVIDER_ID = 'local';

export const MEDIA_MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export const ASSET_MIME_ALLOWLIST = new Map<string, { type: string; extensions: string[] }>([
  ['image/png', { type: 'IMAGE', extensions: ['.png'] }],
  ['image/jpeg', { type: 'IMAGE', extensions: ['.jpg', '.jpeg'] }],
  ['image/webp', { type: 'IMAGE', extensions: ['.webp'] }],
  ['audio/mpeg', { type: 'AUDIO', extensions: ['.mp3'] }],
  ['audio/wav', { type: 'AUDIO', extensions: ['.wav'] }],
  ['audio/wave', { type: 'AUDIO', extensions: ['.wav'] }],
  ['video/mp4', { type: 'VIDEO', extensions: ['.mp4'] }],
  ['text/plain', { type: 'SUBTITLE', extensions: ['.srt', '.vtt', '.txt'] }],
  ['application/json', { type: 'DOCUMENT', extensions: ['.json'] }],
]);

export const STORAGE_KEY_RE =
  /^v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MOCK_VIDEO_FAIL_SENTINEL = '__mock_fail__';
export const MOCK_VISUAL_FAIL_SENTINEL = '__mock_fail_visual__';
export const MOCK_VOICE_FAIL_SENTINEL = '__mock_fail_voice__';
export const MOCK_SUBTITLE_FAIL_SENTINEL = '__mock_fail_subtitle__';
export const MOCK_COMPOSE_FAIL_SENTINEL = '__mock_fail_compose__';
export const MOCK_FINALIZE_FAIL_SENTINEL = '__mock_fail_finalize__';

export const MIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
