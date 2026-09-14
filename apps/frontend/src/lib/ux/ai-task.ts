export const AI_TASK_STATES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;

export type AITaskStateV1 = (typeof AI_TASK_STATES)[number];

export const AI_TASK_COPY: Record<
  AITaskStateV1,
  { stage: string; canLeave: string; next: string }
> = {
  QUEUED: {
    stage: "已排队，马上开始",
    canLeave: "可以先离开，稍后再回来看结果",
    next: "完成后会停留在当前页",
  },
  RUNNING: {
    stage: "正在生成",
    canLeave: "可以先离开，进度会继续",
    next: "完成后请回到当前任务确认",
  },
  COMPLETED: {
    stage: "已完成",
    canLeave: "可以继续下一步",
    next: "请确认结果后再继续",
  },
  FAILED: {
    stage: "没有完成",
    canLeave: "可以稍后重试",
    next: "请查看说明后重试",
  },
};
