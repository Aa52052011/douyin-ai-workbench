import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { isCurrentFinalAcceptance, videoWorkspaceStatus } from "./video.workspace";
import { isEligiblePublishVideo } from "./publication.form";
import type { VideoRecord } from "./video.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/videos/page.tsx"), "utf8");

function video(partial: Partial<VideoRecord> & { id: string }): VideoRecord {
  return { status: "COMPLETED", createdAt: "2026-01-01T00:00:00.000Z", ...partial };
}

function run() {
  assert.match(page, /isCurrentFinalAcceptance/);
  assert.match(page, /✓ 最终成片已确认/);
  assert.match(page, /视频待审核/);

  const completed = video({ id: "c1" });
  assert.equal(isCurrentFinalAcceptance(completed), false);
  assert.equal(videoWorkspaceStatus(completed), "视频待审核");
  assert.equal(isEligiblePublishVideo(completed), false);

  const accepted = video({
    id: "c2",
    outputAsset: { contentPath: "/v" },
    finalAcceptance: { id: "a", current: true, acceptedArtifactId: "art", variant: "VERTICAL", status: "ACCEPTED" },
  });
  assert.equal(isCurrentFinalAcceptance(accepted), true);
  assert.equal(videoWorkspaceStatus(accepted), "最终成片已确认");
  assert.equal(isEligiblePublishVideo(accepted), true);

  const superseded = video({
    id: "old",
    outputAsset: { contentPath: "/old" },
    finalAcceptance: { id: "old-a", current: false, acceptedArtifactId: "art-old", variant: "VERTICAL", status: "ACCEPTED" },
  });
  assert.equal(isCurrentFinalAcceptance(superseded), false);
  assert.equal(isEligiblePublishVideo(superseded), false);

  const historicalCompleted = video({ id: "hist", outputAsset: { contentPath: "/h" } });
  assert.equal(isEligiblePublishVideo(historicalCompleted), false);

  console.log("video-acceptance selfcheck PASS");
}

run();
