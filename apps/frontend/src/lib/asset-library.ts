export const LIBRARY_MAX_UPLOAD_BYTES = 128 * 1024 * 1024;

export type AssetLibraryItem = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  sourceType: string;
  referenceOnly: boolean;
  reusable: boolean;
  rightsStatus: string;
  usedCount: number;
  contentPath: string;
  createdAt: string;
};

export function assetTypeLabel(type: string): string {
  return { IMAGE: "图片", VIDEO: "视频", AUDIO: "音频", DIGITAL_HUMAN: "数字人" }[type] ?? "素材";
}

export function assetSourceLabel(sourceType: string): string {
  return { PROJECT_UPLOAD: "项目上传", REFERENCE: "参考素材" }[sourceType] ?? "上传";
}

export function assetRightsLabel(status: string): string {
  return { USER_CONFIRMED: "用户确认可用", RESTRICTED: "受限" }[status] ?? "待确认";
}

export function libraryHasRawEnumVisible(text: string): boolean {
  return /PROJECT_UPLOAD|USER_CONFIRMED|EXISTING_ASSET|IMAGE|VIDEO/.test(text) && /_/.test(text) && /[A-Z]{3,}/.test(text) && text.includes("_");
}

export function libraryTypeFromFile(file: { name: string; type: string }): string {
  const mime = file.type || libraryMimeFromFile(file);
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("image/")) return "IMAGE";
  return "IMAGE";
}

export function libraryMimeFromFile(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  if (file.name.endsWith(".mp4")) return "video/mp4";
  if (file.name.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function sizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function assetCardModel(item: AssetLibraryItem) {
  return {
    id: item.id,
    filename: item.originalFilename,
    typeLabel: assetTypeLabel(item.type),
    sourceLabel: assetSourceLabel(item.sourceType),
    rightsLabel: assetRightsLabel(item.rightsStatus),
    reusableLabel: item.reusable ? "可复用" : "不可复用",
    referenceOnly: item.referenceOnly,
    sizeLabel: sizeLabel(item.size),
    durationLabel: item.duration ? `${item.duration} 秒` : "",
    resolutionLabel: item.width && item.height ? `${item.width}×${item.height}` : "",
    usedCount: item.usedCount,
    contentPath: item.contentPath,
  };
}
