/**
 * Worker 进程边界。
 * 实际执行在 apps/backend（JobProcessor → VideoGenerationService），
 * 避免复制 Provider / Storage。
 */
export async function bootstrap(): Promise<void> {
  await import('../../apps/backend/dist/worker.js');
}
