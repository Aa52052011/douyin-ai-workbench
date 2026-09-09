import Link from "next/link";
import type { NextProductionAction, TopicProductionItem } from "../lib/content-planning.production";
import { nextActionHref, scriptHrefForTopic } from "../lib/content-planning.production";

export function ContentPlanningCurrentFocus({
  projectId,
  planId,
  topic,
  action,
  canScript,
  isCurrentProduction,
}: {
  projectId: string;
  planId: string;
  topic: TopicProductionItem;
  action: NextProductionAction;
  canScript: boolean;
  isCurrentProduction: boolean;
}) {
  const primaryHref =
    isCurrentProduction && action.kind !== "COMPLETE"
      ? nextActionHref(projectId, planId, action)
      : topic.status === "NOT_STARTED"
        ? scriptHrefForTopic(projectId, planId, topic.topicId)
        : topic.scriptId
          ? `/dashboard/projects/${projectId}/content/scripts?contentPlanId=${encodeURIComponent(planId)}&topicId=${encodeURIComponent(topic.topicId)}`
          : null;

  const primaryLabel =
    isCurrentProduction && action.kind !== "COMPLETE"
      ? action.label
      : topic.status === "NOT_STARTED"
        ? "开始制作这条脚本"
        : "查看脚本";

  return (
    <section className="rounded-xl border border-neutral-900 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {isCurrentProduction ? "现在先做这一条" : "选题详情"}
      </p>
      <h2 className="mt-1 text-base font-medium text-neutral-950">
        {topic.sequenceLabel} · {topic.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{topic.statusLabel}</p>

      <dl className="mt-3 space-y-2 text-sm text-neutral-800">
        {topic.hook ? (
          <div>
            <dt className="text-neutral-500">开场钩子</dt>
            <dd>{topic.hook}</dd>
          </div>
        ) : null}
        {topic.contentAngle ? (
          <div>
            <dt className="text-neutral-500">内容角度</dt>
            <dd>{topic.contentAngle}</dd>
          </div>
        ) : null}
        {topic.contentPillar || topic.format ? (
          <div>
            <dt className="text-neutral-500">支柱 / 形式</dt>
            <dd>{[topic.contentPillar, topic.format].filter(Boolean).join(" · ")}</dd>
          </div>
        ) : null}
        {topic.cta ? (
          <div>
            <dt className="text-neutral-500">CTA</dt>
            <dd>{topic.cta}</dd>
          </div>
        ) : null}
        {topic.reason ? (
          <div>
            <dt className="text-neutral-500">为什么安排在这里</dt>
            <dd>{topic.reason}</dd>
          </div>
        ) : (
          <div>
            <dt className="text-neutral-500">为什么安排在这里</dt>
            <dd>按本期内容规划的固定顺序推进，便于整周内容连贯。</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {canScript && primaryHref ? (
          <Link className="rounded-md bg-neutral-950 px-4 py-2 text-sm text-white" href={primaryHref}>
            {primaryLabel}
          </Link>
        ) : null}
        {canScript && topic.status !== "NOT_STARTED" && topic.scriptId ? (
          <>
            <Link
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-800"
              href={scriptHrefForTopic(projectId, planId, topic.topicId)}
            >
              重新生成脚本
            </Link>
            <p className="w-full text-xs text-neutral-500">
              重新生成只会生成这一条的新脚本版本，不会改变整套周计划。
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
