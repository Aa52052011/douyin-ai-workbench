import { readFileSync } from 'node:fs';

export const B2_6B_TASK_MODULES = ['UI_STRUCTURE'] as const;

export function assertB26BCallShape(input: { taskModules: readonly string[]; frameCount: number; timeoutMs: number }): void {
  if (input.taskModules.length !== 1 || input.taskModules[0] !== 'UI_STRUCTURE') {
    throw new Error('B26B_UI_STRUCTURE_ONLY');
  }
  if (input.frameCount < 1 || input.frameCount > 3) {
    throw new Error('B26B_FRAME_LIMIT');
  }
  if (input.timeoutMs > 120_000) {
    throw new Error('B26B_TIMEOUT_TOO_HIGH');
  }
  if (input.taskModules.includes('TEXT_EVIDENCE') || input.taskModules.includes('DEVELOPER_ARTIFACT')) {
    throw new Error('B26B_EXTRA_MODULE_FORBIDDEN');
  }
}

export function scriptForbidsExtraModules(scriptSource: string): boolean {
  return !scriptSource.includes("'TEXT_EVIDENCE'") && !scriptSource.includes("'DEVELOPER_ARTIFACT'");
}

export function loadUtf8(path: string): string {
  return readFileSync(path, 'utf8');
}
