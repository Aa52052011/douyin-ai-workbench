import { TechnicalDetailsPanel } from "./ui/error-state";
import { boundVideoLabel, monitoringStatusLabel } from "../lib/ux/publication-monitoring-v5";

export function PublishedPostSummaryV5({
  title,
  publishedAtLabel,
  url,
  boundVideo,
  monitoringStatus,
  technicalIds,
}: {
  title: string;
  publishedAtLabel?: string;
  url?: string | null;
  boundVideo: boolean;
  monitoringStatus?: string | null;
  technicalIds?: string;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm" data-acf-published-post-summary-v5>
      <h2 className="text-base font-medium">作品信息</h2>
      <p>作品标题：{title}</p>
      <p>发布时间：{publishedAtLabel || "未填写"}</p>
      <p className="break-all">
        作品链接：
        {url ? (
          <a className="underline" href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        ) : (
          "未填写"
        )}
      </p>
      <p>绑定成片：{boundVideoLabel(boundVideo)}</p>
      <p>当前监控状态：{monitoringStatusLabel(monitoringStatus)}</p>
      {technicalIds ? <TechnicalDetailsPanel details={technicalIds} /> : null}
    </section>
  );
}
