export function VideoProductionContextHeaderV4({
  title,
  stageLabel,
  scriptStatus,
  videoStatus,
  nextAction,
}: {
  title: string;
  stageLabel: string;
  scriptStatus?: string;
  videoStatus?: string;
  nextAction?: string;
}) {
  return (
    <div
      className="mb-4 rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] px-3 py-2 text-sm"
      data-acf-video-production-context-header
    >
      <p className="text-neutral-800">{title}</p>
      <p className="acf-caption mt-1">
        当前：{stageLabel}
        {scriptStatus ? ` · 脚本：${scriptStatus}` : ""}
        {videoStatus ? ` · 视频：${videoStatus}` : ""}
      </p>
      {nextAction ? <p className="acf-caption mt-1">下一步：{nextAction}</p> : null}
    </div>
  );
}
