export type TimelinePublicView = {
  summary?: string;
  clips?: Array<{ label?: string; duration?: number }>;
  reusedAssetCount?: number;
  generatedShotCount?: number;
  durationLabel?: string;
  shots?: Array<{ sequence: number; timeLabel?: string; mediaLabel?: string; sourceLabel?: string }>;
  warnings?: string[];
};

export function isRawTimelineEnumVisible(text: string): boolean {
  return /EXISTING_ASSET|SHOT_STRUCTURE|SOURCE_AGENT/.test(text);
}
