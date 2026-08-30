/**
 * BullMQ workers 入口。
 * 初始化阶段仅占位：不连接 Redis，不注册队列，不执行任务。
 */
export function bootstrap(): void {
  console.log("[workers] scaffold ready");
}
