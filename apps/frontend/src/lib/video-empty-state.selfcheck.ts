import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { resolveVideoWorkspaceSelection, videoBelongsToScript } from "./video.workspace";
import type { ContentPlanRecord } from "./content-planning.types";
import type { ScriptRecord } from "./script.types";
import type { VideoRecord } from "./video.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

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
  const page = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const empty = read("components/empty-state.tsx");

  assert.match(page, /还不能制作视频/);
  assert.match(page, /当前内容计划还没有已确认脚本/);
  assert.match(page, /请先完成并确认脚本/);
  assert.match(page, /返回脚本/);
  assert.match(page, /data-acf-video-empty-blocked/);
  assert.match(page, /compact/);
  assert.match(empty, /compact/);
  assert.match(empty, /max-w-md/);
  assert.match(page, /VideoProductionContextHeaderV4/);
  assert.match(page, /\{scriptId \? \(/);
  assert.match(page, /nextHref=\{scriptId \? flow\.next\?\.href : undefined\}/);
  assert.doesNotMatch(page, /nextHref=\{flow\.next\?\.href\}/);
  assert.equal(page.includes("不会使用其他计划的历史成片"), false);

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

  const current = resolveVideoWorkspaceSelection({
    plans: [v1, v2],
    scripts: [oldScript],
    videos: [oldVideo],
  });
  assert.equal(current.scriptId, "");
  assert.equal(current.videoId, null);
  assert.equal(current.productionPlanId, v2.id);
  assert.equal(videoBelongsToScript(oldVideo, current.scriptId), false);

  console.log("video-empty-state selfcheck PASS");
}

run();
