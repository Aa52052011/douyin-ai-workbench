import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { canDownloadAcceptedVariant } from "./video.workspace";
import type { VideoRecord } from "./video.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/videos/page.tsx"), "utf8");
const download = readFileSync(path.join(root, "lib/video-download.ts"), "utf8");

function run() {
  assert.match(page, /正在准备下载…/);
  assert.match(page, /已开始下载，请查看浏览器下载记录/);
  assert.match(page, /已开始下载，请查看浏览器下载记录/);
  assert.equal(page.includes("下载成功"), false);
  assert.equal(page.includes("下载完成"), false);
  assert.equal(page.includes("文件已保存"), false);
  assert.match(page, /triggerBrowserDownload/);
  assert.match(download, /link.download/);

  const notReady: VideoRecord = {
    id: "v",
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
    outputAsset: { contentPath: "/x", status: "PROCESSING" },
    finalAcceptance: { id: "a", current: true, acceptedArtifactId: "art", variant: "VERTICAL", status: "ACCEPTED" },
  };
  assert.equal(canDownloadAcceptedVariant(notReady, "vertical"), false);

  const ready: VideoRecord = {
    ...notReady,
    outputAsset: { contentPath: "/x", status: "READY" },
  };
  assert.equal(canDownloadAcceptedVariant(ready, "vertical"), true);
  assert.equal(canDownloadAcceptedVariant(ready, "landscape"), false);

  const unaccepted: VideoRecord = {
    id: "u",
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
    outputAsset: { contentPath: "/x", status: "READY" },
  };
  assert.equal(canDownloadAcceptedVariant(unaccepted, "vertical"), false);

  console.log("video-download-ux selfcheck PASS");
}

run();
