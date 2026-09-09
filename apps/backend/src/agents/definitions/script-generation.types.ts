import type { AccountPositioningOutput } from './account-positioning.types.js';
import { FORBIDDEN_CONTEXT_KEYS } from './account-positioning.types.js';
import type { ContentTopic } from './content-planning.types.js';
import type {
  CompactContentPlanContext,
  CompactPreviousScriptSummary,
  CompactStrategyContext,
} from './script-generation.context.js';

export const SCRIPT_TARGET_DURATION_VALUES = [15, 30, 45, 60] as const;
export type ScriptTargetDuration = (typeof SCRIPT_TARGET_DURATION_VALUES)[number];

export type ScriptGenerationInput = {
  contentPlanId: string;
  topicId: string;
  topic: ContentTopic;
  positioning: AccountPositioningOutput;
  platform: string;
  contentStyle?: string;
  planTitle?: string;
  targetDuration: ScriptTargetDuration;
  requirements?: string;
  /** Server-assembled week plan context (12.12P). */
  contentPlanContext?: CompactContentPlanContext;
  /** Server-assembled prior confirmed script digests (12.12P). */
  previousScriptSummaries?: CompactPreviousScriptSummary[];
  /** Server-assembled strategy digest when available (12.12P). */
  strategyContext?: CompactStrategyContext;
};

export type ScriptSection = {
  sequence: number;
  narration: string;
  visualSuggestion: string;
  subtitle: string;
  duration: number;
};

export type ScriptOutput = {
  title: string;
  hook: string;
  opening: string;
  sections: ScriptSection[];
  ending: string;
  cta: string;
  totalDuration: number;
  estimatedWordCount: number;
  voiceStyle: string;
  visualStyle: string;
  productionNotes: string[];
};

export const SCRIPT_GENERATION_INPUT_KEYS = [
  'contentPlanId',
  'topicId',
  'topic',
  'positioning',
  'platform',
  'contentStyle',
  'planTitle',
  'targetDuration',
  'requirements',
  'contentPlanContext',
  'previousScriptSummaries',
  'strategyContext',
] as const;

export const SCRIPT_FORBIDDEN_KEYS = FORBIDDEN_CONTEXT_KEYS;

export const SCRIPT_WORD_BUDGET: Record<ScriptTargetDuration, { min: number; max: number }> = {
  15: { min: 60, max: 80 },
  30: { min: 120, max: 160 },
  45: { min: 180, max: 230 },
  60: { min: 240, max: 300 },
};
