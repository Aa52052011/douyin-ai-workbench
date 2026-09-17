export function positioningSourceLabel(kind: "user" | "reuse" | "ai" | "suggest"): string {
  if (kind === "user") return "你填写";
  if (kind === "reuse") return "已从项目资料复用";
  if (kind === "suggest") return "AI 建议";
  return "AI 已整理";
}
