import Link from "next/link";
import type { ContentPlanView, TopicCardView } from "../lib/content-planning.types";
import { scriptHref } from "../lib/content-planning.form";

function TopicCardV3({
  topic,
  projectId,
  planId,
  canScript,
  recommended,
}: {
  topic: TopicCardView;
  projectId: string;
  planId: string;
  canScript: boolean;
  recommended?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3" data-acf-topic-card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-medium">{topic.title}</h4>
        {recommended ? <span className="acf-caption">推荐优先制作</span> : null}
      </div>
      <dl className="mt-2 space-y-1 text-sm text-neutral-700">
        {topic.contentAngle ? (
          <div>
            <dt className="text-neutral-500">核心角度</dt>
            <dd>{topic.contentAngle}</dd>
          </div>
        ) : null}
        {topic.targetAudience ? (
          <div>
            <dt className="text-neutral-500">目标用户</dt>
            <dd>{topic.targetAudience}</dd>
          </div>
        ) : null}
        {topic.reason ? (
          <div>
            <dt className="text-neutral-500">内容目的</dt>
            <dd>{topic.reason}</dd>
          </div>
        ) : null}
        {topic.format ? (
          <div>
            <dt className="text-neutral-500">推荐形式</dt>
            <dd>{topic.format}</dd>
          </div>
        ) : topic.contentPillar ? (
          <div>
            <dt className="text-neutral-500">推荐形式</dt>
            <dd>{topic.contentPillar}</dd>
          </div>
        ) : null}
        {topic.statusLabel ? (
          <div>
            <dt className="text-neutral-500">状态</dt>
            <dd>{topic.statusLabel}</dd>
          </div>
        ) : null}
        {topic.cta ? (
          <div>
            <dt className="text-neutral-500">希望观众下一步做什么</dt>
            <dd>{topic.cta}</dd>
          </div>
        ) : null}
      </dl>
      {canScript && topic.id ? (
        <Link className="mt-3 inline-block rounded-md border px-3 py-1.5 text-sm" href={scriptHref(projectId, planId, topic.id)}>
          为这个选题生成脚本
        </Link>
      ) : null}
    </article>
  );
}

export function ContentPlanningTopics({
  view,
  projectId,
  planId,
  canScript,
  strategyLabel,
  archived,
}: {
  view: ContentPlanView;
  projectId: string;
  planId: string;
  canScript: boolean;
  strategyLabel?: string;
  archived?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      {archived ? <p className="text-sm text-neutral-600">已归档</p> : null}
      {strategyLabel ? <p className="text-sm text-neutral-600">{strategyLabel}</p> : null}
      <div>
        <h2 className="text-base font-medium">{view.title}</h2>
        {view.summary ? <p className="mt-1 text-sm text-neutral-600">{view.summary}</p> : null}
        <p className="mt-2 text-sm text-neutral-500">
          {[view.statusLabel, `${view.topicCount} 条内容`].filter(Boolean).join(" · ")}
        </p>
      </div>
      {view.dayGroups.map((group) => (
        <section key={group.dayIndex}>
          <h3 className="mb-2 text-sm font-medium">{group.heading}</h3>
          <div className="space-y-3">
            {group.topics.map((topic, index) => (
              <TopicCardV3
                key={topic.id || `${group.dayIndex}-${index}`}
                topic={topic}
                projectId={projectId}
                planId={planId}
                canScript={canScript}
                recommended={index === 0 && group.dayIndex === view.dayGroups[0]?.dayIndex}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
