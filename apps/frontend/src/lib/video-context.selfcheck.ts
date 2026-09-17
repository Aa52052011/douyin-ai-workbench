import assert from "node:assert/strict";
import { resolveVideoWorkspaceSelection, videoBelongsToScript, videoWorkspaceStatus } from "./video.workspace";
import type { ContentPlanRecord } from "./content-planning.types";
import type { ScriptRecord } from "./script.types";
import type { VideoRecord } from "./video.types";

const payload = {
  title: "脚本",
  hook: "h",
  opening: "o",
  sections: [{ sequence: 1, narration: "n", visualSuggestion: "v", subtitle: "s", duration: 8 }],
  ending: "e",
  cta: "c",
  totalDuration: 30,
  estimatedWordCount: 10,
  voiceStyle: "t",
  visualStyle: "vis",
  productionNotes: [],
};

function plan(id: string, version: number, status: string): ContentPlanRecord {
  return { id, version, status, createdAt: "2026-01-01T00:00:00.000Z", payload: { title: "p", summary: "s", topics: [] } };
}

function script(partial: Partial<ScriptRecord> & { id: string }): ScriptRecord {
  return {
    version: 1,
    status: "CONFIRMED",
    createdAt: "2026-01-01T00:00:00.000Z",
    payload,
    ...partial,
  };
}

function video(partial: Partial<VideoRecord> & { id: string }): VideoRecord {
  return {
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function run() {
  const v1 = plan("01a0a0f6-bc2c-7d72-b466-4ea1b60c6f46", 1, "CONFIRMED");
  const v2 = plan("01a0a648-3db7-7191-a91b-621cc99f4751", 2, "CONFIRMED");
  const oldScript = script({ id: "s-v1", contentPlanId: v1.id, topicId: "t1" });
  const oldVideo = video({
    id: "cb66555a-7170-4948-8d70-67809e966a38",
    scriptId: oldScript.id,
    finalAcceptance: {
      id: "acc",
      current: true,
      acceptedArtifactId: "863b3445-8f46-4200-a51e-f8d288a4786d",
      variant: "VERTICAL",
      status: "ACCEPTED",
    },
    outputAsset: { contentPath: "/a", status: "READY" },
  });

  const missing = resolveVideoWorkspaceSelection({
    plans: [v1, v2],
    scripts: [oldScript],
    videos: [oldVideo],
  });
  assert.equal(missing.scriptId, "");
  assert.equal(missing.videoId, null);
  assert.equal(missing.productionPlanId, v2.id);

  const historical = resolveVideoWorkspaceSelection({
    queryScriptId: oldScript.id,
    plans: [v1, v2],
    scripts: [oldScript],
    videos: [oldVideo],
  });
  assert.equal(historical.scriptId, oldScript.id);
  assert.equal(historical.viewingHistorical, true);
  assert.equal(historical.videoId, oldVideo.id);

  assert.equal(videoBelongsToScript(oldVideo, "other"), false);
  assert.equal(videoWorkspaceStatus(null), "待制作视频");
  assert.equal(videoWorkspaceStatus(oldVideo), "最终成片已确认");
  assert.equal(
    videoWorkspaceStatus({
      id: "x",
      status: "COMPLETED",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    "视频待审核",
  );

  console.log("video-context selfcheck PASS");
}

run();
