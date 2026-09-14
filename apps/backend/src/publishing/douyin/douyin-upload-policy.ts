export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES = 50 * MB;
export const CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES = 300 * MB;
export const MAX_TOTAL_VIDEO_BYTES = 4 * GB;
export const RECOMMENDED_CHUNK_SIZE_BYTES = 20 * MB;
export const MINIMUM_CHUNK_SIZE_BYTES = 5 * MB;

export const DOUYIN_CHUNK_ENDPOINTS = {
  init: '/api/douyin/v1/video/init_video_part_upload/',
  uploadPart: '/api/douyin/v1/video/upload_video_part/',
  complete: '/api/douyin/v1/video/complete_video_part_upload/',
} as const;

export type DouyinUploadStrategyV1 = 'SIMPLE_UPLOAD' | 'CHUNK_RECOMMENDED' | 'CHUNKED_UPLOAD_REQUIRED' | 'FILE_TOO_LARGE';

export type DouyinUploadStrategyPolicyV1 = {
  fileSizeBytes: number;
  recommendedSimpleMaxBytes: number;
  chunkRequiredAboveBytes: number;
  maxTotalBytes: number;
  selectedStrategy: DouyinUploadStrategyV1;
  reason: string;
  source: 'OFFICIAL_PROVIDER_POLICY';
  chunkRuntime: 'NOT_IMPLEMENTED';
};

export function evaluateDouyinUploadStrategy(fileSizeBytes: number): DouyinUploadStrategyPolicyV1 {
  let selectedStrategy: DouyinUploadStrategyV1 = 'SIMPLE_UPLOAD';
  let reason = 'FILE_WITHIN_SIMPLE_UPLOAD';
  if (fileSizeBytes <= 0) {
    selectedStrategy = 'FILE_TOO_LARGE';
    reason = 'FILE_EMPTY_OR_INVALID';
  } else if (fileSizeBytes > MAX_TOTAL_VIDEO_BYTES) {
    selectedStrategy = 'FILE_TOO_LARGE';
    reason = 'EXCEEDS_4GB_TOTAL_SIZE_BOUNDARY';
  } else if (fileSizeBytes > CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES) {
    selectedStrategy = 'CHUNKED_UPLOAD_REQUIRED';
    reason = 'FILE_ABOVE_300MB_CHUNK_REQUIRED';
  } else if (fileSizeBytes > SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES) {
    selectedStrategy = 'CHUNK_RECOMMENDED';
    reason = 'FILE_ABOVE_50MB_CHUNK_RECOMMENDED_SIMPLE_STILL_ALLOWED';
  } else {
    selectedStrategy = 'SIMPLE_UPLOAD';
    reason = 'FILE_WELL_BELOW_50MB_RECOMMENDATION_THRESHOLD';
  }
  return {
    fileSizeBytes,
    recommendedSimpleMaxBytes: SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES,
    chunkRequiredAboveBytes: CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES,
    maxTotalBytes: MAX_TOTAL_VIDEO_BYTES,
    selectedStrategy,
    reason,
    source: 'OFFICIAL_PROVIDER_POLICY',
    chunkRuntime: 'NOT_IMPLEMENTED',
  };
}

export function content01UploadPolicy(fileSizeBytes = 4_246_350): DouyinUploadStrategyPolicyV1 {
  return evaluateDouyinUploadStrategy(fileSizeBytes);
}
