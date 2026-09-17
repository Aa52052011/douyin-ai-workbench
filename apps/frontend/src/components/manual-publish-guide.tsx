import Link from "next/link";

export function ManualPublishGuideV4({
  publishHref,
}: {
  publishHref?: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4 text-sm" data-acf-manual-publish-guide>
      <p className="font-medium">下一步：手动发布</p>
      <p className="mt-1 text-neutral-600">当前使用手动发布模式。下载后可手动发布到抖音。</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-neutral-700">
        <li>下载视频</li>
        <li>打开抖音发布</li>
        <li>发布后回来登记作品</li>
      </ol>
      <p className="mt-3 text-neutral-600">发布完成后回来登记作品，即可继续数据监控与AI复盘。</p>
      {publishHref ? (
        <Link className="mt-3 inline-flex rounded-md bg-neutral-950 px-4 py-2 text-white" href={publishHref}>
          去登记作品
        </Link>
      ) : null}
    </section>
  );
}
