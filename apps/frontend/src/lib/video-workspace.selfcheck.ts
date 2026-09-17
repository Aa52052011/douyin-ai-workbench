import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const review = read("components/video-review-panel-v2.tsx");
  assert.match(page, /还不能制作视频/);
  assert.match(page, /这条内容还没有视频/);
  assert.match(page, /开始制作视频/);
  assert.match(page, /AsyncTaskProgressV1/);
  assert.match(page, /VideoPreviewPanelV2/);
  assert.match(page, /VideoReviewPanelV2/);
  assert.match(review, /确认最终成片/);
  assert.match(page, /acceptFinalVideo/);
  assert.match(page, /下载竖版视频/);
  assert.match(page, /NextActionBarV1/);
  assert.doesNotMatch(page, /WorkspacePageShell/);
  assert.equal(page.includes("overflow-y-auto"), false);
  assert.equal(/useEffect\([\s\S]*createVideo\(/.test(page.slice(0, page.indexOf("async function generate"))), false);
  assert.equal(page.includes("立即发布到抖音"), false);
  assert.equal(page.includes("一键发布到抖音"), false);
  assert.equal(page.includes("下载成功"), false);
  assert.equal(page.includes("下载完成"), false);

  const preview = read("components/video-detail.tsx");
  assert.match(preview, /VideoPreviewPanelV2/);
  assert.match(preview, /object-contain/);
  assert.match(preview, /9 \/ 16/);

  console.log("video-workspace selfcheck PASS");
}

run();
