export const AI_VIDEO_PROVIDER_WANXIANG = 'wanxiang-video:v1' as const;

export type AiVideoGenerateRequestV1 = {
  requestId: string;
  promptBrief: string;
  negativeConstraints: string[];
  targetDurationMs: number;
  aspect: '9:16' | '16:9';
  executeNow: false;
};

export type AiVideoProviderV1 = {
  id: string;
  validateConfig(): { ok: boolean; missing: string[] };
  getCapabilities(): { video: true; implemented: boolean };
  generate(request: AiVideoGenerateRequestV1): Promise<never>;
};

export const WANXIANG_VIDEO_ADAPTER: AiVideoProviderV1 = {
  id: AI_VIDEO_PROVIDER_WANXIANG,
  validateConfig() {
    return { ok: false, missing: ['WANXIANG_VIDEO_PROVIDER_NOT_IMPLEMENTED'] };
  },
  getCapabilities() {
    return { video: true, implemented: false };
  },
  async generate() {
    throw new Error('WANXIANG_VIDEO_NO_REAL_CALL');
  },
};

export function wanxiangVideoStatus(): 'NOT_IMPLEMENTED' {
  return 'NOT_IMPLEMENTED';
}
