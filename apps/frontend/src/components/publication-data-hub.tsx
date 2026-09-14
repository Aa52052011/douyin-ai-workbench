import Link from "next/link";
import { Card } from "./ui/card";
import { hubNextAction } from "../lib/ux/publication-monitoring-v5";

export function PublicationDataHub({
  projectId,
  hasMetrics,
  hasPublished,
  pendingPublishCount = 0,
  pendingRegisterCount = 0,
  monitoringCount = 0,
  analysisReadyCount = 0,
  reviewedCount = 0,
}: {
  projectId: string;
  hasMetrics?: boolean;
  hasPublished?: boolean;
  pendingPublishCount?: number;
  pendingRegisterCount?: number;
  monitoringCount?: number;
  analysisReadyCount?: number;
  reviewedCount?: number;
}) {
  const publishHref = `/dashboard/projects/${projectId}/publish`;
  const monitorHref = `/dashboard/monitoring`;
  const analysisHref = `/dashboard/projects/${projectId}/performance`;
  const next = hubNextAction({
    pendingPublishCount,
    pendingRegisterCount,
    waitingMetricsCount: monitoringCount,
    analysisReadyCount,
  });

  return (
    <Card className="mb-6" data-acf-publication-data-hub data-acf-publication-data-hub-v5>
      <p className="acf-section-title">发布与数据</p>
      <p className="acf-caption mt-1">导出成片、手动发布、登记作品、录入数据、AI复盘都在这条路径里。当前没有自动发布。</p>
      {next ? <p className="mt-2 text-sm font-medium">{next.label}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <HubBucket href={publishHref} label="待发布" count={pendingPublishCount} primary />
        <HubBucket href={publishHref} label="待登记" count={pendingRegisterCount} />
        <HubBucket href={monitorHref} label="监控中" count={hasPublished ? Math.max(monitoringCount, 0) : monitoringCount} />
        <HubBucket href={analysisHref} label="待复盘" count={analysisReadyCount} />
        <HubBucket href={analysisHref} label="已复盘" count={reviewedCount} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="inline-flex rounded-[var(--acf-radius-sm)] bg-[var(--acf-brand)] px-3 py-1.5 text-sm text-white" href={publishHref}>
          待发布 / 手动发布
        </Link>
        <Link className="inline-flex rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 py-1.5 text-sm" href={monitorHref}>
          {hasPublished ? "数据监控" : "已发布作品"}
        </Link>
        <Link className="inline-flex rounded-[var(--acf-radius-sm)] border border-[var(--acf-border)] px-3 py-1.5 text-sm" href={analysisHref}>
          {hasMetrics ? "开始AI复盘" : "录入数据"}
        </Link>
      </div>
    </Card>
  );
}

function HubBucket({
  href,
  label,
  count,
  primary,
}: {
  href: string;
  label: string;
  count: number;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[var(--acf-radius-sm)] border px-3 py-2 text-sm ${
        primary ? "border-[var(--acf-border-strong)] bg-[var(--acf-surface-subtle)]" : "border-[var(--acf-border)]"
      }`}
    >
      <span className="block text-neutral-500">{label}</span>
      <span className="text-base font-medium">{count}</span>
    </Link>
  );
}

export function ContextReuseSummary({
  positioningLine,
  audience,
  style,
  platform,
  duration,
  editHref,
}: {
  positioningLine?: string;
  audience?: string;
  style?: string;
  platform?: string;
  duration?: string;
  editHref: string;
}) {
  if (!positioningLine && !audience && !style && !platform) return null;
  return (
    <Card data-acf-context-reuse>
      <p className="acf-section-title">已记住的账号资料</p>
      <p className="acf-caption mt-1">已根据你的账号资料继续使用。可以直接改，不会锁死。</p>
      {positioningLine ? <p className="acf-body mt-2">{positioningLine}</p> : null}
      {audience ? <p className="acf-body-secondary mt-1">想给谁看：{audience}</p> : null}
      {style ? <p className="acf-body-secondary mt-1">表达风格：{style}</p> : null}
      {platform ? <p className="acf-body-secondary mt-1">主平台：{platform}</p> : null}
      {duration ? <p className="acf-body-secondary mt-1">目标时长：{duration}</p> : null}
      <div className="mt-3">
        <Link className="inline-flex rounded-[var(--acf-radius-sm)] border border-[var(--acf-border-strong)] px-3 py-1.5 text-sm" href={editHref}>
          修改定位
        </Link>
      </div>
    </Card>
  );
}
