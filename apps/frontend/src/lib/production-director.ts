/**
 * Step 13.7 — Frontend Production Director view helpers.
 */

export type ProductionPlanView = {
  mode: string;
  modeLabel: string;
  rationale: string;
  targetDuration: number;
  shotCount: number;
  voiceStrategyLabel: string;
  subtitleStrategyLabel: string;
  pacingStrategyLabel: string;
  visualStrategy: string;
  sourceOverview: string[];
  warnings: string[];
  shootingGuidance: Array<{
    optional: true;
    shotDescription: string;
    duration: number;
    framing: string;
    action: string;
  }>;
  fallbackSummary: string;
  referencePatternCount: number;
  status: string;
  directorVersion: string;
  contextHash: string;
  generationVersion?: string;
  created?: boolean;
};

export const PRODUCTION_PLAN_DISCLAIMER =
  "如果不补拍，系统会自动使用素材库或 AI 画面继续制作。参考内容只学习结构，不会把参考素材直接做成片。";

export function isRawProductionEnumVisible(text: string): boolean {
  return (
    text.includes("REAL_FOOTAGE") ||
    text.includes("DIGITAL_HUMAN_BROLL") ||
    text.includes("VOICEOVER_ASSETS") ||
    text.includes("AI_ASSISTED") ||
    text.includes("CURRENT_UPLOAD") ||
    text.includes("AI_VIDEO") ||
    text.includes("DIGITAL_HUMAN_UNAVAILABLE")
  );
}
