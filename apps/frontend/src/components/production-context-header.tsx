import Link from "next/link";
import { ContextualGuidanceV1 } from "./contextual-guidance-v1";
import {
  nextProductionStage,
  PRODUCTION_STAGES_V3,
  type ProductionStageIdV3,
} from "../lib/ux/production-journey";

export function ProductionContextHeaderV3({
  projectName,
  stageId,
  completed,
}: {
  projectName: string;
  stageId: ProductionStageIdV3;
  completed?: ProductionStageIdV3[];
}) {
  const current = PRODUCTION_STAGES_V3.find((item) => item.id === stageId);
  const next = nextProductionStage(stageId);
  const done = new Set(completed ?? []);
  return (
    <div>
    <ContextualGuidanceV1 id={stageId} />
    <div className="mb-4 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2 text-sm" data-acf-production-context-header>
      <p className="text-neutral-600">
        {projectName}
        <span className="mx-2 text-neutral-300">·</span>
        当前：{current?.label}
        {done.has(stageId) ? "（已完成）" : ""}
      </p>
      <p className="acf-caption mt-1">
        已完成：
        {PRODUCTION_STAGES_V3.filter((item) => done.has(item.id))
          .map((item) => item.label)
          .join("、") || "还没有"}
        {next ? ` · 下一步：${next.label}` : ""}
      </p>
    </div>
    </div>
  );
}

export function WorkflowFooterV3({
  projectId,
  stageId,
}: {
  projectId: string;
  stageId: ProductionStageIdV3;
}) {
  const current = PRODUCTION_STAGES_V3.find((item) => item.id === stageId);
  const next = nextProductionStage(stageId);
  const prev = PRODUCTION_STAGES_V3[PRODUCTION_STAGES_V3.findIndex((item) => item.id === stageId) - 1];
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3 text-sm" data-acf-workflow-footer>
      {prev ? (
        <Link className="text-neutral-600 underline" href={prev.href(projectId)}>
          返回{prev.label}（已写入的内容还在）
        </Link>
      ) : (
        <span />
      )}
      <span className="text-neutral-800">当前：{current?.label}</span>
      {next ? (
        <span className="text-neutral-600">下一步：{next.label}</span>
      ) : (
        <span />
      )}
    </div>
  );
}
