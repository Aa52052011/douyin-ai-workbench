export const ONBOARDING_STORAGE_KEY = "acf.first-run.onboarding.v1.dismissed";
export const ONBOARDING_PERSISTENCE = "LOCAL" as const;

export const FIRST_RUN_STEPS = [
  { id: "welcome", title: "欢迎", body: "这是一个从定位到发布、再看数据复盘的内容工作台。当前是手动发布，不会自动发到抖音。" },
  { id: "project", title: "创建项目", body: "先建一个项目，用来记住你的账号和内容。" },
  { id: "positioning", title: "确认账号定位", body: "告诉系统你做什么内容。后续计划和脚本会复用这些信息，仍可修改。" },
  { id: "plan", title: "生成第一份内容计划", body: "定位确认后，再生成接下来几天的选题。" },
] as const;

/** User-facing first-run list (3 steps). FIRST_RUN_STEPS keeps 4 entries for wave-6. */
export const FIRST_RUN_PRODUCT_STEPS = [
  { id: "project", title: "创建项目", body: "先建一个项目，用来记住账号资料。" },
  { id: "positioning", title: "确认账号定位", body: "核对 AI 整理的账号方向，改完再确认。" },
  { id: "plan", title: "生成第一份内容计划", body: "确认定位后，生成接下来几天的选题。" },
] as const;

export const CONTENT_WORKFLOW_OVERVIEW = [
  { title: "账号定位", body: "确认你做什么内容和给谁看。" },
  { title: "内容计划", body: "生成接下来几天要拍的选题。" },
  { title: "脚本", body: "把选题写成可拍的口播稿。" },
  { title: "视频", body: "生成成片，确认后再进入发布。" },
  { title: "发布", body: "在抖音手动发布，再回来登记作品。" },
  { title: "数据", body: "录入你在抖音看到的表现。" },
  { title: "AI复盘", body: "根据已录入数据给出建议，不会自动应用。" },
] as const;

export const POSITIONING_FIRST_STEP_COPY = {
  title: "第一步：确认账号定位",
  body: "AI会根据你的项目资料整理账号方向，你可以修改后再确认。",
} as const;

export function isOnboardingDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
}

export function dismissOnboarding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
}

export function shouldShowFirstRunOnboarding(hasProjects: boolean, dismissed: boolean): boolean {
  return !hasProjects && !dismissed;
}

export function positioningFirstStepStorageKey(projectId: string): string {
  return `acf.positioning.first-step.v1.${projectId}.dismissed`;
}

export const CONTEXTUAL_GUIDANCE: Record<string, { title: string; body: string; next: string }> = {
  dashboard: {
    title: "从这一步开始",
    body: "工作台只列出真实待办。没有项目时，先创建第一个项目。",
    next: "创建项目后进入账号定位。",
  },
  positioning: {
    title: "AI已整理，可编辑后确认",
    body: "先告诉系统你做什么内容，后续计划和脚本会自动复用这些信息。",
    next: "确认定位后，去生成内容计划。",
  },
  planning: {
    title: "只展示摘要，点击查看详情",
    body: "根据已记住的账号资料生成选题。不需要把定位再填一遍。",
    next: "确认计划后，为选题写脚本。",
  },
  script: {
    title: "AI稿可编辑，确认后再制作视频",
    body: "把选题写成可拍的口播结构。确认后才能制作视频。",
    next: "确认脚本后即可制作视频。",
  },
  video: {
    title: "确认最终成片后才进入发布",
    body: "生成竖版成片后先预览，再下载。不会自动发到抖音。",
    next: "下载后去手动发布并登记作品。",
  },
  publish: {
    title: "当前为手动发布模式",
    body: "下载成片，在抖音自己发布，再回来粘贴作品链接完成登记。",
    next: "登记后录入你在抖音看到的数据。",
  },
  monitoring: {
    title: "数据监控",
    body: "发布视频后回来登记。这里跟踪已发布作品，不会自动抓取抖音。",
    next: "有数据后再做 AI 复盘。",
  },
  analysis: {
    title: "建议不会自动应用",
    body: "录入真实数据后才可以复盘。当前展示的是基于已录入指标的观察，不是完整分析代理的全部能力。",
    next: "建议逐条审核，不会自动改下一轮内容。",
  },
};

export function guidanceStorageKey(id: string): string {
  return `acf.contextual-guidance.v1.${id}.dismissed`;
}
