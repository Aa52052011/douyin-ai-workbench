export type ProductionStageIdV3 = "positioning" | "planning" | "script" | "video";

export type ProductionStageStateV3 = {
  id: ProductionStageIdV3;
  label: string;
  href: (projectId: string) => string;
};

export const PRODUCTION_STAGES_V3: ProductionStageStateV3[] = [
  { id: "positioning", label: "账号定位", href: (id) => `/dashboard/projects/${id}/positioning` },
  { id: "planning", label: "内容计划", href: (id) => `/dashboard/projects/${id}/content/plans` },
  { id: "script", label: "选题与脚本", href: (id) => `/dashboard/projects/${id}/content/scripts` },
  { id: "video", label: "视频制作", href: (id) => `/dashboard/projects/${id}/content/videos` },
];

export function productionStageIndex(id: ProductionStageIdV3): number {
  return PRODUCTION_STAGES_V3.findIndex((item) => item.id === id);
}

export function nextProductionStage(id: ProductionStageIdV3) {
  return PRODUCTION_STAGES_V3[productionStageIndex(id) + 1] ?? null;
}

export function prevProductionStage(id: ProductionStageIdV3) {
  const index = productionStageIndex(id);
  return index > 0 ? PRODUCTION_STAGES_V3[index - 1] : null;
}

export function contentPlansHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/plans`;
}
