import assert from "node:assert/strict";
import type { VideoRecord } from "./video.types";
import {
  canManualComplete,
  canOpenMetrics,
  canRetryPublication,
  canSubmitComplete,
  createPublicationBody,
  eligiblePublishVideos,
  emptyCompleteForm,
  metricsCreateOnPublish,
  mockProviderVisible,
  mountWriteOperations,
  oauthVisible,
  performanceHref,
  publicationsForVideo,
  resolvePublishVideoQuery,
  validateExternalUrl,
} from "./publication.form";
import type { PublicationRecord } from "./publication.types";
import {
  formatPublishedAt,
  parsePublicationRecord,
  publicationHistoryViews,
  publicationStatusLabel,
  publicationView,
  viewModelHasRawContract,
  viewModelHasSecret,
} from "./publication.view";

function video(partial: Partial<VideoRecord> & Pick<VideoRecord, "id" | "status">): VideoRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    scriptTitle: partial.scriptTitle ?? "30秒沟通清单脚本",
    outputAsset: partial.outputAsset,
    ...partial,
  };
}

function publication(partial: Partial<PublicationRecord> & Pick<PublicationRecord, "id" | "status">): PublicationRecord {
  return {
    createdAt: partial.createdAt ?? "2026-03-01T00:00:00.000Z",
    videoId: partial.videoId ?? "video-ready",
    title: partial.title ?? "30秒沟通清单脚本",
    ...partial,
  };
}

function run() {
  const videos = [
    video({ id: "video-ready", status: "COMPLETED", outputAsset: { contentPath: "/assets/a/content" } }),
    video({ id: "video-pending", status: "PENDING", outputAsset: { contentPath: "/assets/b/content" } }),
    video({ id: "video-failed", status: "FAILED", outputAsset: { contentPath: "/assets/c/content" } }),
    video({ id: "video-no-asset", status: "COMPLETED" }),
  ];

  // 1 + 2 eligible Video COMPLETED + output asset
  assert.deepEqual(
    eligiblePublishVideos(videos).map((item) => item.id),
    ["video-ready"],
  );
  assert.equal(
    eligiblePublishVideos(videos).some((item) => item.status !== "COMPLETED"),
    false,
  );

  // 3 valid videoId query preselect
  const validQuery = resolvePublishVideoQuery("video-ready", eligiblePublishVideos(videos));
  assert.equal(validQuery.videoId, "video-ready");
  assert.equal(validQuery.warning, null);

  // 4 invalid query no fallback
  const pendingQuery = resolvePublishVideoQuery("video-pending", eligiblePublishVideos(videos));
  assert.equal(pendingQuery.videoId, "");
  assert.notEqual(pendingQuery.videoId, "video-ready");
  assert.equal(pendingQuery.warning, "所选视频已不可发布，请重新选择。");
  const missingQuery = resolvePublishVideoQuery("missing", eligiblePublishVideos(videos));
  assert.equal(missingQuery.videoId, "");

  // 5 mount no create
  assert.deepEqual(mountWriteOperations(), []);

  // 6 create body only real DTO
  const body = createPublicationBody(" 成片标题 ");
  assert.deepEqual(Object.keys(body).sort(), ["mode", "platform", "title", "visibility"]);
  assert.equal(body.mode, "MANUAL");
  assert.equal(body.platform, "DOUYIN");
  assert.equal(body.visibility, "PUBLIC");
  assert.equal(body.title, "成片标题");
  assert.equal("platformAccountId" in body, false);
  assert.equal("provider" in body, false);

  // 7 status 中文
  assert.equal(publicationStatusLabel("PENDING"), "待发布");
  assert.equal(publicationStatusLabel("PUBLISHED"), "已发布");
  assert.equal(publicationStatusLabel("FAILED"), "发布失败");
  assert.equal(publicationStatusLabel("UNKNOWN_EXTERNAL_STATE"), "发布状态待确认");
  assert.equal(publicationStatusLabel("PROCESSING"), "发布中");
  assert.equal(publicationStatusLabel("PENDING").includes("PENDING"), false);

  // 8 publishedAt formatting
  assert.ok(formatPublishedAt("2026-03-01T08:00:00.000Z"));
  assert.equal(formatPublishedAt(""), "");

  // 9 external URL validation
  assert.equal(validateExternalUrl(""), null);
  assert.equal(validateExternalUrl("https://www.douyin.com/video/1"), null);
  assert.equal(validateExternalUrl("not-a-url"), "请填写有效的作品链接。");
  assert.equal(validateExternalUrl("javascript:alert(1)"), "请填写有效的作品链接。");
  assert.equal(canSubmitComplete({ externalUrl: "https://www.douyin.com/video/1", externalPostId: "" }), true);
  assert.equal(canSubmitComplete(emptyCompleteForm()), false);

  // 10 PUBLISHED metrics handoff
  assert.equal(
    performanceHref("proj-1", "pub-1"),
    "/dashboard/projects/proj-1/performance?publicationId=pub-1",
  );

  // 11 non-PUBLISHED no metrics CTA
  assert.equal(canOpenMetrics("PUBLISHED"), true);
  assert.equal(canOpenMetrics("PENDING"), false);
  assert.equal(canManualComplete(publication({ id: "p1", status: "PENDING" })), true);
  assert.equal(canManualComplete(publication({ id: "p2", status: "PUBLISHED" })), false);

  // 12 multiple publications allowed
  assert.equal(
    publicationsForVideo(
      [
        publication({ id: "a", status: "PUBLISHED", videoId: "video-ready" }),
        publication({ id: "b", status: "PENDING", videoId: "video-ready" }),
        publication({ id: "c", status: "PUBLISHED", videoId: "other" }),
      ],
      "video-ready",
    ).length,
    2,
  );

  // 13 + 14 mock / OAuth hidden
  assert.equal(mockProviderVisible(), false);
  assert.equal(oauthVisible(), false);

  // 15 retry only if semantically allowed
  assert.equal(canRetryPublication(), false);

  // 16 + 17 no raw provider / secret
  const view = publicationView(publication({ id: "p3", status: "PUBLISHED", externalUrl: "https://www.douyin.com/video/1" }), videos[0]);
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasSecret(view), false);
  assert.equal(JSON.stringify(view).includes("sourceJobId"), false);
  assert.equal(JSON.stringify(view).includes("OAuth"), false);
  assert.equal(JSON.stringify(view).includes("platformSecret"), false);

  // 18 history sort
  const history = publicationHistoryViews(
    [
      publication({ id: "old", status: "PUBLISHED", createdAt: "2026-03-01T00:00:00.000Z" }),
      publication({ id: "new", status: "PENDING", createdAt: "2026-03-03T00:00:00.000Z" }),
    ],
    videos,
  );
  assert.deepEqual(
    history.map((item) => item.statusLabel),
    ["待发布", "已发布"],
  );

  // 19 malformed rejected
  assert.equal(parsePublicationRecord({ foo: 1 }), null);
  assert.ok(parsePublicationRecord(publication({ id: "ok", status: "PENDING" })));

  // 20 no auto metrics
  assert.equal(metricsCreateOnPublish(), false);

  console.log("publication selfcheck PASS");
}

run();
