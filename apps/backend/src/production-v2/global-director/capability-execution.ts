export const CAPABILITY_EXECUTION_VERSION = 'capability.execution-result:v1' as const;
export const FROZEN_VERTICAL_SHA =
  'acc8916fdc33a32309a705158ebc3a97cd491b40535cc8569c0a6f924b12f2e0';
export const FROZEN_LANDSCAPE_SHA =
  'ed11e92de4c9e13f5fea553f28dbb147804d6d8ceee12f4e9d9c3f3d8aa57e5a';
export const TARGET_TIMELINE_MS = 45_677;
export const DUCKING_REDUCTION_DB = 12;

export type CapabilityStatusV1 =
  | 'LIVE_VALIDATED'
  | 'GENERATED'
  | 'BLOCKED_CONFIG'
  | 'BLOCKED_PERMISSION'
  | 'FAILED_PROVIDER'
  | 'SKIPPED_NOT_IMPLEMENTED'
  | 'SKIPPED_IDENTITY_REQUIRED'
  | 'PENDING_HUMAN_REVIEW';

export type CapabilityExecutionResultV1 = {
  executionId: string;
  manifestId: string;
  capability: string;
  requestId: string;
  provider: string;
  model: string;
  attemptCount: number;
  successfulGenerationCount: number;
  status: CapabilityStatusV1;
  artifactRefs: string[];
  errorCode?: string;
  manualActionRequired: boolean;
  createdAt: string;
};

export function section4ImagePrompt(): string {
  return [
    'Composition-safe master still for a professional AI software workbench.',
    'Centered subject with generous safe margins for later 9:16 and 16:9 crops.',
    'Calm documentary mood: a clean product UI or desk monitor showing restrained Chinese text',
    '“不预设爆款 / 不保证结果” and “先执行，再看证据”.',
    'Neutral gray-blue lighting, evidence and verification feeling, not advertising.',
    'No people, no faces, no likeness of any real person.',
    'No exploding charts, no guaranteed success, no money, no trophies, no fire, no 100 percent claims.',
  ].join(' ');
}

export function section4NegativePrompt(): string {
  return [
    'photorealistic person, face, portrait, celebrity, user likeness',
    'viral growth, exploding line chart, guaranteed success, 100% success',
    'money, gold coins, cash, revenue screenshot, trophy, fire, flames',
    'exaggerated advertising, luxury, clickbait',
  ].join(', ');
}

export function c6PromptValidation(prompt: string, negative: string): { safe: boolean; boundClaim: 'C6' } {
  const forbidden = /保证爆款|保证增长|保证收益|金钱飞舞|百分百成功|疯狂增长/;
  const hasNeg = /保证爆款|增长|收益|trophy|money|viral/i.test(negative);
  return { safe: !forbidden.test(prompt) && hasNeg, boundClaim: 'C6' };
}

export function corePathReady(input: { scriptOk: boolean; narrationOk: boolean; visualsOk: boolean }): 'READY' | 'BLOCKED' {
  return input.scriptOk && input.narrationOk && input.visualsOk ? 'READY' : 'BLOCKED';
}
