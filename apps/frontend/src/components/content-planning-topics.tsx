"use client";

import Link from "next/link";
import { useState } from "react";
import type { ContentPlanView, TopicCardView } from "../lib/content-planning.types";
import { scriptHref } from "../lib/content-planning.form";
import {
  resolveTopicUserFacingV2,
  type TopicProductionItem,
} from "../lib/content-planning.production";
import type { ScriptRecord } from "../lib/script.types";
import type { VideoRecord } from "../lib/video.types";
import { Dialog } from "./ui/dialog";

function topicAngle(topic: TopicCardView) {
  return topic.contentAngle || topic.hook || "";
}

function topicFormat(topic: TopicCardView) {
  return topic.format || topic.contentPillar || "";
}

function TopicCardV3({
  topic,
  production,
  userLabel,
  ctaLabel,
  ctaHref,
  canScript,
  highlightScriptAction,
  onOpen,
}: {
  topic: TopicCardView;
  production?: TopicProductionItem;
  userLabel: string;
  ctaLabel: string;
  ctaHref: string | null;
  canScript: boolean;
  highlightScriptAction?: boolean;
  onOpen: () => void;
}) {
  const day = production?.dayIndex ?? topic.dayIndex;
  const angle = topicAngle(topic);
  const format = topicFormat(topic);
  if (!highlightScriptAction) {
    return (
      <article
        className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-[var(--acf-border-subtle)] py-2.5"
        data-acf-topic-card
        data-acf-topic-row
      >
        <p className="acf-caption pt-0.5">第 {day} 条</p>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-medium">{topic.title}</h3>
          {angle ? <p className="acf-caption mt-0.5 line-clamp-2">{angle}</p> : null}
          <p className="acf-caption mt-0.5 truncate">
            {[format, userLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button className="shrink-0 pt-0.5 text-sm text-[var(--acf-text-secondary)] underline" type="button" onClick={onOpen}>
          查看详情
        </button>
      </article>
    );
  }
  return (
    <article
      className="min-w-0 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-4 py-3 acf-stage-current"
      data-acf-topic-card
      data-acf-topic-priority
    >
      <p className="acf-caption">当前优先 · 第 {day} 条</p>
      <h3 className="mt-1 line-clamp-2 text-base font-medium">{topic.title}</h3>
      {angle ? <p className="acf-body-secondary mt-1 line-clamp-2">{angle}</p> : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {format ? (
          <span className="acf-caption inline-block rounded-[var(--acf-radius-sm)] bg-[var(--acf-surface-muted)] px-1.5 py-0.5">
            {format}
          </span>
        ) : null}
        <span>状态：{userLabel}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button className="text-sm text-[var(--acf-text-secondary)] underline" type="button" onClick={onOpen}>
          查看详情
        </button>
        {canScript && ctaHref ? (
          <Link className="text-sm text-[var(--acf-text-secondary)]" href={ctaHref}>
            {ctaLabel === "制作脚本" ? "制作脚本 →" : `${ctaLabel} →`}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function TopicDetailDrawerV1({
  topic,
  production,
  userLabel,
  ctaLabel,
  ctaHref,
  canScript,
  readOnly,
  onClose,
}: {
  topic: TopicCardView;
  production?: TopicProductionItem;
  userLabel: string;
  ctaLabel: string;
  ctaHref: string | null;
  canScript: boolean;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const primaryHref = canScript && !readOnly ? ctaHref : production?.scriptId ? ctaHref : null;
  const primaryLabel = production?.scriptId && ctaLabel !== "制作脚本" ? "查看脚本" : canScript ? ctaLabel : null;
  return (
    <Dialog open title={topic.title} description={`状态：${userLabel}`} onClose={onClose}>
      <dl className="space-y-2 text-sm">
        {topic.contentAngle ? (
          <div>
            <dt className="acf-caption">核心角度</dt>
            <dd>{topic.contentAngle}</dd>
          </div>
        ) : null}
        {topic.targetAudience ? (
          <div>
            <dt className="acf-caption">目标用户</dt>
            <dd>{topic.targetAudience}</dd>
          </div>
        ) : null}
        {topic.reason ? (
          <div>
            <dt className="acf-caption">内容目的</dt>
            <dd>{topic.reason}</dd>
          </div>
        ) : null}
        {topic.format || topic.contentPillar ? (
          <div>
            <dt className="acf-caption">推荐形式</dt>
            <dd>{topic.format || topic.contentPillar}</dd>
          </div>
        ) : null}
        {topic.cta ? (
          <div>
            <dt className="acf-caption">希望观众下一步做什么</dt>
            <dd>{topic.cta}</dd>
          </div>
        ) : null}
        {topic.hook ? (
          <div>
            <dt className="acf-caption">开场钩子</dt>
            <dd>{topic.hook}</dd>
          </div>
        ) : null}
        {topic.painPoint ? (
          <div>
            <dt className="acf-caption">痛点</dt>
            <dd>{topic.painPoint}</dd>
          </div>
        ) : null}
      </dl>
      {primaryHref && primaryLabel ? (
        <Link className="mt-4 inline-block text-sm text-[var(--acf-text-secondary)] underline" href={primaryHref}>
          {primaryLabel === "制作脚本" ? "制作脚本" : primaryLabel}
        </Link>
      ) : null}
      {canScript && topic.id && !readOnly ? (
        <p className="sr-only">为这个选题生成脚本</p>
      ) : null}
    </Dialog>
  );
}

export function ContentPlanningTopics({
  view,
  projectId,
  planId,
  canScript,
  strategyLabel,
  archived,
  productionItems = [],
  scripts = [],
  videos = [],
  highlightTopicId,
}: {
  view: ContentPlanView;
  projectId: string;
  planId: string;
  canScript: boolean;
  strategyLabel?: string;
  archived?: boolean;
  productionItems?: TopicProductionItem[];
  scripts?: ScriptRecord[];
  videos?: VideoRecord[];
  highlightTopicId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const flat = view.dayGroups.flatMap((group) => group.topics);
  const priority = highlightTopicId ? flat.find((item) => item.id === highlightTopicId) : undefined;
  const remaining = priority ? flat.filter((item) => item.id !== priority.id) : flat;
  const openTopic = flat.find((item) => (item.id || item.title) === openId) ?? null;
  const openProduction = productionItems.find((item) => item.topicId === openTopic?.id);
  const openFacing = openTopic
    ? resolveTopicUserFacingV2({
        projectId,
        planId,
        planConfirmed: canScript,
        item:
          openProduction ?? {
            topicId: openTopic.id,
            topicIndex: 0,
            dayIndex: openTopic.dayIndex,
            dayLabel: `第 ${openTopic.dayIndex} 条`,
            sequenceLabel: `第 ${openTopic.dayIndex} 条`,
            title: openTopic.title,
            status: "NOT_STARTED",
            statusLabel: "待制作脚本",
          },
        scripts,
        videos,
      })
    : null;

  function renderCard(topic: TopicCardView, index: number, highlight: boolean) {
    const production = productionItems.find((item) => item.topicId === topic.id);
    const facing = resolveTopicUserFacingV2({
      projectId,
      planId,
      planConfirmed: canScript,
      item:
        production ?? {
          topicId: topic.id,
          topicIndex: index,
          dayIndex: topic.dayIndex,
          dayLabel: `第 ${topic.dayIndex} 条`,
          sequenceLabel: `第 ${topic.dayIndex} 条`,
          title: topic.title,
          status: "NOT_STARTED",
          statusLabel: "待制作脚本",
        },
      scripts,
      videos,
    });
    return (
      <TopicCardV3
        key={topic.id || `${topic.dayIndex}-${index}`}
        topic={topic}
        production={production}
        userLabel={facing.label}
        ctaLabel={facing.ctaLabel}
        ctaHref={facing.href}
        canScript={canScript && !archived}
        highlightScriptAction={highlight}
        onOpen={() => setOpenId(topic.id || topic.title)}
      />
    );
  }

  return (
    <div className="space-y-5" data-acf-week-content>
      {archived ? <p className="acf-caption">历史版本，只读</p> : null}
      {strategyLabel ? <p className="acf-caption">{strategyLabel}</p> : null}
      {priority ? renderCard(priority, 0, true) : null}
      {remaining.length > 0 ? (
        <div className="md:grid-cols-1" data-acf-topic-list>
          {remaining.map((topic, index) => renderCard(topic, index + (priority ? 1 : 0), false))}
        </div>
      ) : null}
      {openTopic && openFacing ? (
        <TopicDetailDrawerV1
          topic={openTopic}
          production={openProduction}
          userLabel={openFacing.label}
          ctaLabel={openFacing.ctaLabel}
          ctaHref={openFacing.href ?? (openTopic.id ? scriptHref(projectId, planId, openTopic.id) : null)}
          canScript={canScript && !archived}
          readOnly={archived}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}
