import assert from "node:assert/strict";
import type { ScriptRecord } from "./script.types";
import {
  canExportVideo,
  canPreviewVideo,
  canPublishVideo,
  canRetryVideo,
  createVideoBody,
  eligibleScripts,
  humanizeVideoError,
  latestVideoForScript,
  mountWriteOperations,
  publicationCreateOnComplete,
  publishHref,
  resolveVideoScriptQuery,
  videosForScript,
} from "./video.form";
import { createVideoPoller, isVideoPollActive, isVideoPollTerminal } from "./video.polling";
import type { VideoRecord } from "./video.types";
import {
  backendProgressPercent,
  humanizeFailedStage,
  humanizeVideoStage,
  parseVideoRecord,
  videoHistoryViews,
  videoStatusLabel,
  videoView,
  viewModelHasRawContract,
  viewModelHasStorageKey,
} from "./video.view";

const validPayload = {
  title: "30秒沟通清单脚本",
  hook: "开口太晚才是坑",
  opening: "先给你一张清单",
  sections: [{ sequence: 1, narration: "旁白", visualSuggestion: "口播", subtitle: "字幕", duration: 8 }],
  ending: "先改一件事",
  cta: "评论区留下一件事",
  totalDuration: 30,
  estimatedWordCount: 140,
  voiceStyle: "冷静中速",
  visualStyle: "口播拆解",
  productionNotes: ["字幕压在安全区"],
};

function script(partial: Partial<ScriptRecord> & Pick<ScriptRecord, "id" | "version" | "status">): ScriptRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    title: partial.title ?? "30秒沟通清单脚本",
    payload: partial.payload ?? validPayload,
    topicSnapshot: partial.topicSnapshot ?? { title: "敏感肌急救", contentAngle: "先停刺激" },
    ...partial,
  };
}

function video(partial: Partial<VideoRecord> & Pick<VideoRecord, "id" | "status">): VideoRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    scriptId: partial.scriptId ?? "script-ready",
    scriptTitle: partial.scriptTitle ?? "30秒沟通清单脚本",
    ...partial,
  };
}

function run() {
  const scripts = [
    script({ id: "script-ready", version: 3, status: "CONFIRMED" }),
    script({ id: "script-draft", version: 4, status: "DRAFT" }),
    script({ id: "script-archived", version: 2, status: "ARCHIVED" }),
    script({ id: "script-bad", version: 5, status: "CONFIRMED", payload: { title: "only" } }),
  ];

  // 1 + 2 eligible Script filtering / CONFIRMED only
  assert.deepEqual(
    eligibleScripts(scripts).map((item) => item.id),
    ["script-ready"],
  );
  assert.equal(
    eligibleScripts(scripts).some((item) => item.status !== "CONFIRMED"),
    false,
  );

  // 3 valid scriptId query preselect
  const validQuery = resolveVideoScriptQuery("script-ready", eligibleScripts(scripts));
  assert.equal(validQuery.scriptId, "script-ready");
  assert.equal(validQuery.warning, null);

  // 4 invalid query no fallback
  const draftQuery = resolveVideoScriptQuery("script-draft", eligibleScripts(scripts));
  assert.equal(draftQuery.scriptId, "");
  assert.notEqual(draftQuery.scriptId, "script-ready");
  assert.equal(draftQuery.warning, "所选脚本已不可用，请重新选择。");
  const missingQuery = resolveVideoScriptQuery("missing", eligibleScripts(scripts));
  assert.equal(missingQuery.scriptId, "");
  assert.equal(missingQuery.warning?.includes("不可用"), true);

  // 5 mount no create
  assert.deepEqual(mountWriteOperations(), []);

  // 6 create body only real DTO
  const body = createVideoBody("script-ready");
  assert.deepEqual(Object.keys(body), ["scriptId"]);
  assert.equal(body.scriptId, "script-ready");
  assert.equal("productionPlan" in body, false);
  assert.equal("voiceStyle" in body, false);
  assert.equal("visualStyle" in body, false);

  // 7 status 中文
  assert.equal(videoStatusLabel("PENDING"), "等待制作");
  assert.equal(videoStatusLabel("PROCESSING"), "制作中");
  assert.equal(videoStatusLabel("COMPLETED"), "已完成");
  assert.equal(videoStatusLabel("FAILED"), "制作失败");
  assert.equal(videoStatusLabel("CANCELLED"), "已取消");
  assert.equal(videoStatusLabel("PENDING").includes("PENDING"), false);

  // 8 stage 中文
  assert.equal(humanizeVideoStage("visual"), "正在生成画面");
  assert.equal(humanizeVideoStage("voice"), "正在生成配音");
  assert.equal(humanizeVideoStage("subtitle"), "正在生成字幕");
  assert.equal(humanizeVideoStage("compose"), "正在合成视频");
  assert.equal(humanizeVideoStage("finalize"), "正在完成成片");
  assert.equal(humanizeVideoStage(""), "正在准备视频");
  assert.equal(humanizeVideoStage("production_plan"), "");
  assert.equal(humanizeFailedStage("compose"), "视频合成失败");
  assert.equal(humanizeFailedStage("subtitle"), "生成字幕失败");

  // compose fail mislabeled as subtitle currentStage → inferred compose
  {
    const failedCompose = video({
      id: "v-compose-fail",
      status: "FAILED",
      job: {
        status: "FAILED",
        progress: 70,
        error: { code: "VIDEO_PROVIDER_FAILED", message: "Compose provider is unavailable" },
        output: {
          currentStage: "subtitle",
          stages: {
            visual: { status: "completed", assetIds: ["i1"] },
            voice: { status: "completed", assetIds: ["a1"] },
            subtitle: { status: "completed", assetIds: ["s1"] },
          },
        },
      },
    });
    const view = videoView(failedCompose);
    assert.equal(view.failedStageLabel, "视频合成失败");
    assert.equal(view.failureMessage.includes("保留"), true);
    assert.equal(view.stages.find((s) => s.key === "subtitle")?.state, "done");
    assert.equal(view.stages.find((s) => s.key === "compose")?.state, "failed");
  }

  // 9 no fake percent if backend absent
  assert.equal(backendProgressPercent(null), null);
  assert.equal(backendProgressPercent({}), null);
  assert.equal(backendProgressPercent({ progress: 55 }), 55);

  // 10 polling terminal state detection
  assert.equal(isVideoPollTerminal(video({ id: "v1", status: "COMPLETED" })), true);
  assert.equal(isVideoPollTerminal(video({ id: "v2", status: "FAILED" })), true);
  assert.equal(isVideoPollTerminal(video({ id: "v3", status: "PENDING", job: { status: "CANCELLED" } })), true);
  assert.equal(isVideoPollTerminal(video({ id: "v4", status: "PENDING", job: { status: "RUNNING" } })), false);
  assert.equal(isVideoPollActive(video({ id: "v4", status: "PENDING", job: { status: "RUNNING" } })), true);

  // 11 polling stops on unmount helper
  let ticks = 0;
  const poller = createVideoPoller({
    load: async () => {
      ticks += 1;
      return video({ id: "v5", status: "PENDING", job: { status: "RUNNING" } });
    },
    onUpdate: () => undefined,
    intervalMs: 10,
    maxTicks: 20,
  });
  poller.start();
  poller.stop();
  assert.equal(ticks, 0);

  // 12 retry eligibility
  assert.equal(canRetryVideo("FAILED"), true);
  assert.equal(canRetryVideo("COMPLETED"), false);
  assert.equal(canRetryVideo("PENDING"), false);

  // 13 completed preview eligibility
  assert.equal(
    canPreviewVideo(
      video({
        id: "v6",
        status: "COMPLETED",
        outputAsset: { contentPath: "/assets/a/content" },
      }),
    ),
    true,
  );
  assert.equal(canPreviewVideo(video({ id: "v7", status: "FAILED" })), false);

  // 14 export eligibility
  assert.equal(canExportVideo("COMPLETED"), true);
  assert.equal(canExportVideo("FAILED"), false);

  // 15 publication handoff href
  assert.equal(publishHref("proj-1", "video-1"), "/dashboard/projects/proj-1/publish?videoId=video-1");

  // 16 + 17 no raw Job fields / no storageKey
  const view = videoView(
    video({
      id: "v8",
      status: "PROCESSING",
      job: {
        status: "RUNNING",
        progress: 30,
        output: { currentStage: "visual", stages: { visual: { status: "running", assetIds: [] } } },
      },
    }),
  );
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasStorageKey(view), false);
  assert.equal(JSON.stringify(view).includes("storageKey"), false);
  assert.equal(JSON.stringify(view).includes("JobProcessor"), false);
  assert.equal(JSON.stringify(view).includes("sourceJobId"), false);

  // 18 history sort
  const history = videoHistoryViews([
    video({ id: "old", status: "COMPLETED", createdAt: "2026-03-01T00:00:00.000Z" }),
    video({ id: "new", status: "PENDING", createdAt: "2026-03-03T00:00:00.000Z" }),
    video({ id: "mid", status: "FAILED", createdAt: "2026-03-02T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    history.map((item) => item.statusLabel),
    ["等待制作", "制作失败", "已完成"],
  );
  assert.deepEqual(
    videosForScript(
      [
        video({ id: "other", status: "COMPLETED", scriptId: "other-script", createdAt: "2026-03-04T00:00:00.000Z" }),
        video({ id: "new", status: "PENDING", createdAt: "2026-03-03T00:00:00.000Z" }),
        video({ id: "old", status: "COMPLETED", createdAt: "2026-03-01T00:00:00.000Z" }),
      ],
      "script-ready",
    ).map((item) => item.id),
    ["new", "old"],
  );
  assert.equal(latestVideoForScript([video({ id: "old", status: "COMPLETED", createdAt: "2026-03-01T00:00:00.000Z" }), video({ id: "new", status: "PENDING", createdAt: "2026-03-03T00:00:00.000Z" })], "script-ready")?.id, "new");

  // 19 malformed Video rejected
  assert.equal(parseVideoRecord({ foo: 1 }), null);
  assert.equal(parseVideoRecord({ id: "v", status: "", createdAt: "2026-03-01T00:00:00.000Z" }), null);
  assert.ok(parseVideoRecord(video({ id: "ok", status: "PENDING" })));
  assert.equal(
    parseVideoRecord({
      id: "accepted",
      status: "COMPLETED",
      createdAt: "2026-03-01T00:00:00.000Z",
      finalAcceptance: {
        id: "acc",
        current: true,
        acceptedArtifactId: "art",
        variant: "VERTICAL",
        status: "ACCEPTED",
      },
    })?.finalAcceptance?.current,
    true,
  );

  // 20 no auto publish
  assert.equal(publicationCreateOnComplete(), false);
  assert.equal(canPublishVideo("COMPLETED"), true);
  assert.equal(canPublishVideo("PENDING"), false);

  assert.equal(humanizeVideoError({ code: "VIDEO_SCRIPT_NOT_CONFIRMED" }), "所选脚本已不可用，请重新选择。");
  assert.equal(humanizeVideoError({ code: "UNKNOWN" }, "accept"), "确认失败，请重试");
  assert.equal(humanizeVideoError({ code: "VIDEO_EXPORT_NOT_AVAILABLE" }, "export"), "视频下载失败，请重试。");
  assert.equal(humanizeVideoError({ code: "UNKNOWN" }).includes("UNKNOWN"), false);

  console.log("video selfcheck PASS");
}

run();
