import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { hasLandscapeArtifact, hasVerticalArtifact, isArtifactReady } from "./video.workspace";
import type { VideoRecord } from "./video.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const variant = readFileSync(path.join(root, "components/video-variant-panel.tsx"), "utf8");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/videos/page.tsx"), "utf8");

function run() {
  assert.match(variant, /竖版 9:16/);
  assert.match(variant, /landscapeAvailable/);
  assert.equal(variant.includes("disabled={!landscapeAvailable}"), false);
  assert.match(page, /hasLandscapeArtifact/);
  assert.match(page, /previewPath/);

  const verticalOnly: VideoRecord = {
    id: "v",
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
    outputAsset: { contentPath: "/vert", status: "READY", width: 1080, height: 1920 },
  };
  assert.equal(hasVerticalArtifact(verticalOnly), true);
  assert.equal(hasLandscapeArtifact(verticalOnly), false);

  const both: VideoRecord = {
    ...verticalOnly,
    landscapeAsset: { contentPath: "/land", status: "READY", width: 1920, height: 1080 },
  };
  assert.equal(hasLandscapeArtifact(both), true);

  assert.equal(isArtifactReady({ contentPath: "/x", status: "PROCESSING" }), false);
  assert.equal(isArtifactReady({ contentPath: "/x", status: "READY" }), true);
  assert.equal(isArtifactReady({}), false);

  console.log("video-orientation selfcheck PASS");
}

run();
