import Link from "next/link";
import type { Project } from "../lib/types";
import {
  currentStageLabel,
  stageCountLabel,
  statusUnavailableLabel,
  type ProjectNextAction,
  type ProjectStageMap,
} from "../lib/project-next-action";
import { projectPlatformLabel } from "../lib/project-platform";

export function ProjectCard({
  project,
  stages,
  nextAction,
}: {
  project: Project;
  stages?: ProjectStageMap;
  nextAction?: ProjectNextAction;
}) {
  const meta = [project.industry, `目标平台：${projectPlatformLabel(project.platform)}`].filter(Boolean).join(" · ");
  return (
    <article className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">
            <Link className="hover:underline" href={`/dashboard/projects/${project.id}`}>
              {project.name}
            </Link>
          </h3>
          {meta ? <p className="mt-1 text-sm text-neutral-600">{meta}</p> : null}
          {project.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{project.description}</p>
          ) : null}
        </div>
        <Link
          className="shrink-0 rounded-md bg-neutral-950 px-3 py-1.5 text-sm text-white"
          href={`/dashboard/projects/${project.id}`}
        >
          继续
        </Link>
      </div>
      {stages ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-neutral-600">当前阶段：{currentStageLabel(stages)}</p>
          <p className="text-neutral-500">{stageCountLabel(stages)}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">{statusUnavailableLabel()}</p>
      )}
      {nextAction ? <p className="mt-2 text-sm text-neutral-700">下一步：{nextAction.label}</p> : null}
    </article>
  );
}
