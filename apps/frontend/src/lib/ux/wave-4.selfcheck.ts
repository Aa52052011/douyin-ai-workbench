import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendProgressPercent } from "../video.view";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  const videos = read("src/app/dashboard/projects/[projectId]/content/videos/page.tsx");
  assert.match(videos, /VideoProductionContextHeaderV4/);
  assert.match(videos, /HumanReviewBar/);
  assert.match(videos, /acceptFinalVideo/);
  assert.match(videos, /下载竖版视频/);
  assert.match(videos, /正在准备下载/);
  assert.match(videos, /已开始下载，请查看浏览器下载记录/);
  assert.match(videos, /ManualPublishGuideV4/);
  assert.match(videos, /你可以离开此页面，任务会继续运行/);
  assert.match(videos, /AITaskState/);
  assert.match(videos, /FinalReviewChecklistV4/);
  assert.equal(videos.includes("立即发布到抖音"), false);
  assert.equal(videos.includes("一键发布到抖音"), false);
  assert.equal(videos.includes("Export Artifact"), false);
  assert.match(videos, /开始制作视频/);
  assert.match(videos, /重试生成/);

  const crop = read("src/app/dashboard/production/review/crop/[sessionId]/page.tsx");
  assert.match(crop, /HumanReviewBar/);
  assert.match(crop, /确认竖版画面/);
  assert.match(crop, /data-acf-final-review-product/);
  assert.match(crop, /技术详情/);
  assert.match(crop, /Approve This Crop/);
  assert.match(crop, /Truth Gate:/);
  assert.match(crop, /Execution Plan:/);
  assert.match(crop, /Artifact ID:/);

  const detail = read("src/components/video-detail.tsx");
  assert.match(detail, /object-contain/);
  assert.match(detail, /成片预览/);

  const publish = read("src/app/dashboard/projects/[projectId]/publish/page.tsx");
  const publishSource = read("src/components/publication-source-form.tsx");
  assert.match(publishSource, /请选择已确认的最终成片/);
  assert.match(publish, /declarePublished/);
  assert.equal(publish.includes("创建发布记录"), false);
  assert.match(publish, /ManualPublishGuideV4/);
  assert.equal(publish.includes("立即发布到抖音"), false);

  assert.equal(backendProgressPercent(null), null);
  assert.equal(backendProgressPercent({}), null);

  console.log("ux-wave4 selfcheck PASS");
}

run();
