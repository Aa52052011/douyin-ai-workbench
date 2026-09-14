function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export type DouyinUploadVideoResponseV1 = {
  success: boolean;
  status: 'UPLOAD_COMPLETED';
  videoId: string;
  width: number | null;
  height: number | null;
  errorCode: number | null;
  description: string | null;
  logId: string | null;
};

export type DouyinCreateVideoResponseV1 = {
  success: boolean;
  status: 'CREATE_SUBMITTED' | 'UNDER_PLATFORM_REVIEW';
  uploadVideoId: string;
  platformItemId: string | null;
  errorCode: number | null;
  description: string | null;
  logId: string | null;
};

export function parseUploadVideoResponse(raw: unknown): {
  videoId: string | null;
  width: number | null;
  height: number | null;
  errorCode: number | null;
  description: string | null;
  logId: string | null;
} {
  const record = asRecord(raw);
  const extra = asRecord(record?.extra);
  const data = asRecord(record?.data) ?? record;
  const video = asRecord(data?.video);
  const videoId = str(video?.video_id) ?? str(data?.video_id);
  const errorCode = num(record?.error_code) ?? num(data?.error_code) ?? num(extra?.error_code);
  const description = str(record?.description) ?? str(data?.description) ?? str(extra?.description);
  const logId = str(extra?.log_id) ?? str(extra?.logid) ?? str(record?.log_id);
  return {
    videoId,
    width: num(video?.width) ?? num(data?.width),
    height: num(video?.height) ?? num(data?.height),
    errorCode,
    description,
    logId,
  };
}

export function requireUploadSuccess(raw: unknown): DouyinUploadVideoResponseV1 {
  const parsed = parseUploadVideoResponse(raw);
  if (!parsed.videoId || (parsed.errorCode !== null && parsed.errorCode !== 0)) {
    throw Object.assign(new Error('UPLOAD_REJECTED'), { parsed });
  }
  return {
    success: true,
    status: 'UPLOAD_COMPLETED',
    videoId: parsed.videoId,
    width: parsed.width,
    height: parsed.height,
    errorCode: parsed.errorCode,
    description: parsed.description,
    logId: parsed.logId,
  };
}

export function parseCreateVideoResponse(raw: unknown): {
  itemId: string | null;
  videoId: string | null;
  errorCode: number | null;
  description: string | null;
  logId: string | null;
} {
  const record = asRecord(raw);
  const extra = asRecord(record?.extra);
  const data = asRecord(record?.data) ?? record;
  return {
    itemId: str(data?.item_id) ?? str(data?.itemId),
    videoId: str(data?.video_id),
    errorCode: num(record?.error_code) ?? num(data?.error_code) ?? num(extra?.error_code),
    description: str(record?.description) ?? str(data?.description) ?? str(extra?.description),
    logId: str(extra?.log_id) ?? str(extra?.logid) ?? str(record?.log_id),
  };
}

export function requireCreateSuccess(raw: unknown, uploadVideoId: string): DouyinCreateVideoResponseV1 {
  const parsed = parseCreateVideoResponse(raw);
  if (parsed.errorCode !== null && parsed.errorCode !== 0) {
    throw Object.assign(new Error('CREATE_REJECTED'), { parsed });
  }
  return {
    success: true,
    status: parsed.itemId ? 'UNDER_PLATFORM_REVIEW' : 'CREATE_SUBMITTED',
    uploadVideoId,
    platformItemId: parsed.itemId,
    errorCode: parsed.errorCode,
    description: parsed.description,
    logId: parsed.logId,
  };
}

export function mapHttpError(status: number, raw: unknown): { code: string; officialErrorCode: number | null; description: string | null; logId: string | null } {
  const parsed = parseUploadVideoResponse(raw);
  if (status === 401 || status === 403) {
    return { code: status === 401 ? 'TOKEN_EXPIRED' : 'SCOPE_MISSING', officialErrorCode: parsed.errorCode, description: parsed.description, logId: parsed.logId };
  }
  if (status === 429) return { code: 'RATE_LIMITED', officialErrorCode: parsed.errorCode, description: parsed.description, logId: parsed.logId };
  if (status >= 500) return { code: 'NETWORK_TRANSIENT', officialErrorCode: parsed.errorCode, description: parsed.description, logId: parsed.logId };
  return { code: 'UNKNOWN_PROVIDER_ERROR', officialErrorCode: parsed.errorCode, description: parsed.description, logId: parsed.logId };
}
