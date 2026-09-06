export const SCRIPT_TARGET_DURATIONS = [15, 30, 45, 60] as const;
export type ScriptTargetDuration = (typeof SCRIPT_TARGET_DURATIONS)[number];
export const SCRIPT_REQUIREMENTS_MAX = 2000;

export type ScriptSectionRecord = {
  sequence?: number;
  narration?: string;
  visualSuggestion?: string;
  subtitle?: string;
  duration?: number;
};

export type ScriptPayloadRecord = {
  title?: string;
  hook?: string;
  opening?: string;
  sections?: ScriptSectionRecord[];
  ending?: string;
  cta?: string;
  totalDuration?: number;
  estimatedWordCount?: number;
  voiceStyle?: string;
  visualStyle?: string;
  productionNotes?: string[];
};

export type ScriptRecord = {
  id: string;
  projectId?: string;
  contentPlanId?: string | null;
  topicId?: string | null;
  title?: string;
  content?: string;
  version: number;
  status: string;
  payload?: unknown;
  topicSnapshot?: unknown;
  createdAt: string;
};

export type ScriptFormState = {
  contentPlanId: string;
  topicId: string;
  targetDuration: number;
  requirements: string;
};

export type ScriptSectionView = {
  sequence: number;
  narration: string;
  visualSuggestion: string;
  subtitle: string;
  duration: number;
};

export type ScriptView = {
  title: string;
  hook: string;
  opening: string;
  sections: ScriptSectionView[];
  ending: string;
  cta: string;
  totalDuration: number;
  estimatedWordCount: number;
  voiceStyle: string;
  visualStyle: string;
  productionNotes: string[];
};

export type ScriptHistoryItemView = {
  version: number;
  createdAtLabel: string;
  statusLabel: string;
  title: string;
  durationLabel: string;
  readable: boolean;
};

export type RecentScriptItemView = {
  id: string;
  title: string;
  topicTitle: string;
  statusLabel: string;
  createdAtLabel: string;
};

export type TopicSourceView = {
  title: string;
  contentAngle?: string;
  targetAudience?: string;
  hook?: string;
  cta?: string;
  dayIndex?: number;
  contentPillar?: string;
  priorityLabel?: string;
};

export const SCRIPT_RAW_CONTRACT_TERMS = [
  "ScriptOutput",
  "AgentRun",
  "topicSnapshot",
  "sourceAgentRunId",
  "payload",
  "campaignStrategy",
  "MarketInsight",
] as const;
