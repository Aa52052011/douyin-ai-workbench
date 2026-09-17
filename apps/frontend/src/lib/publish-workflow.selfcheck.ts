import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  pendingProductionPublishVideos,
  PUBLISH_WORKFLOW_STEPS,
  publishWorkflowStepIndex,
  resolvePublishCurrentVideo,
} from "./publish.workspace";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const card = read("components/manual-publish-card-v5.tsx");
  assert.deepEqual([...PUBLISH_WORKFLOW_STEPS], ["准备成片", "手动发布", "登记作品", "录入数据", "查看表现"]);
  assert.match(page, /准备成片/);
  assert.match(page, /手动发布/);
  assert.match(page, /登记作品/);
  assert.match(page, /录入数据/);
  assert.match(page, /查看表现/);
  assert.match(page, /还没有可发布的最终成片/);
  assert.match(page, /先在视频页确认最终成片，再回来发布/);
  assert.match(page, /去视频/);
  assert.match(page, /手动发布模式 · 系统不会自动发布或自动抓取抖音数据/);
  assert.match(page, /下载并确认最终成片后/);
  assert.match(page, /登记作品/);
  assert.match(page, /data-acf-publish-empty-blocked/);
  assert.match(page, /compact/);
  assert.doesNotMatch(page, /ContextualGuidanceV1/);
  const history = read("components/publication-history.tsx");
  assert.match(history, /已登记作品/);
  assert.equal(history.includes("本期已登记作品"), false);
  const hub = read("components/publication-data-hub.tsx");
  assert.match(hub, /data-acf-publication-hub-compact/);
  assert.match(hub, /可发布 \{pendingPublishCount\}/);
  assert.match(hub, /pendingPublishCount > 0/);
  assert.match(page, /PublishWorkflowStepsV1/);
  assert.match(page, /declarePublished/);
  assert.match(card, /我已经发布/);
  assert.equal(page.includes("立即发布到抖音"), false);
  assert.equal(page.includes("一键发布"), false);
  assert.equal(publishWorkflowStepIndex({ hasCurrentVideo: true, downloaded: false, registering: false, registered: false, hasMetrics: false }), 0);
  assert.equal(publishWorkflowStepIndex({ hasCurrentVideo: true, downloaded: true, registering: false, registered: false, hasMetrics: false }), 1);
  assert.equal(publishWorkflowStepIndex({ hasCurrentVideo: true, downloaded: true, registering: true, registered: false, hasMetrics: false }), 2);
  const historicalId = "cb66555a-7170-4948-8d70-67809e966a38";
  assert.equal(resolvePublishCurrentVideo(historicalId, []).videoId, "");
  assert.equal(resolvePublishCurrentVideo(undefined, []).videoId, "");
  assert.equal(
    pendingProductionPublishVideos(
      [{ id: historicalId, status: "COMPLETED", createdAt: "2026-01-01", scriptId: "old", finalAcceptance: { id: "a", current: true, acceptedArtifactId: "x", variant: "VERTICAL", status: "ACCEPTED" }, outputAsset: { id: "o", contentPath: "p" } }],
      [{ videoId: historicalId }],
      [{ id: "v2", status: "CONFIRMED", version: 2, createdAt: "2026-09-01" }],
      [],
    ).length,
    0,
  );
  console.log("publish-workflow selfcheck PASS");
}

run();
