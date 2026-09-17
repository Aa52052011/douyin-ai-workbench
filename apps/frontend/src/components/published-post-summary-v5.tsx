import { TechnicalDetailsPanel } from "./ui/error-state";
import {
  boundVideoLabel,
  monitoringStatusLabel,
  publicationTruthCopy,
  registrationVerificationCopy,
} from "../lib/ux/publication-monitoring-v5";

export function PublishedPostSummaryV5({
  title,
  publishedAtLabel,
  url,
  boundVideo,
  boundVideoTitle,
  monitoringStatus,
  technicalIds,
}: {
  title: string;
  publishedAtLabel?: string;
  url?: string | null;
  boundVideo: boolean;
  boundVideoTitle?: string | null;
  monitoringStatus?: string | null;
  technicalIds?: string;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 text-sm" data-acf-published-post-summary-v5>
      <h2 className="text-base font-medium">作品信息</h2>
      <p>作品标题：{title}</p>
      <p>登记时间：{publishedAtLabel || "未填写"}</p>
      <p>发布来源：用户手动发布</p>
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
      <p>绑定成片：{boundVideoLabel(boundVideo, boundVideoTitle)}</p>
      <p>当前监控状态：{monitoringStatusLabel(monitoringStatus)}</p>
      <p>登记状态：{boundVideo || monitoringStatus ? registrationVerificationCopy("USER_ASSERTED") : "未登记"}</p>
      <p>{publicationTruthCopy()}</p>
      <p>未进行平台验证</p>
      {technicalIds ? <TechnicalDetailsPanel details={technicalIds} /> : null}
    </section>
  );
}
