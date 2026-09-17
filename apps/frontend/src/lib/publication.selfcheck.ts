import assert from "node:assert/strict";
import type { VideoRecord } from "./video.types";
import {
  canManualComplete,
  canOpenMetrics,
  canRetryPublication,
  canSubmitComplete,
  createPublicationBody,
  defaultPublicationTitle,
  eligiblePublishVideos,
  emptyCompleteForm,
  findDuplicatePublication,
  isRegistrationFormVisible,
  isPublicationSourceBound,
  publicationCreatedOnDeclarePublished,
  pendingManualPublishVideos,
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
    video({
      id: "video-ready",
      status: "COMPLETED",
      outputAsset: { contentPath: "/assets/a/content" },
      finalAcceptance: { id: "acc-ready", current: true, acceptedArtifactId: "art-a", variant: "VERTICAL", status: "ACCEPTED" },
    }),
    video({ id: "video-pending", status: "PENDING", outputAsset: { contentPath: "/assets/b/content" } }),
    video({ id: "video-failed", status: "FAILED", outputAsset: { contentPath: "/assets/c/content" } }),
    video({ id: "video-no-asset", status: "COMPLETED" }),
    video({
      id: "video-completed-unaccepted",
      status: "COMPLETED",
      outputAsset: { contentPath: "/assets/d/content" },
    }),
  ];

  // 1 + 2 eligible Video COMPLETED + output asset
  assert.deepEqual(
    eligiblePublishVideos(videos).map((item) => item.id),
    ["video-ready"],
  );
  assert.equal(eligiblePublishVideos(videos).some((item) => item.status !== "COMPLETED"), false);
  assert.equal(eligiblePublishVideos(videos).some((item) => item.id === "video-completed-unaccepted"), false);

  const sixCompleted = [
    video({ id: "v1", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
    video({ id: "v2", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
    video({ id: "v3", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
    video({ id: "v4", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
    video({ id: "v5", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
    video({
      id: "v6",
      status: "COMPLETED",
      outputAsset: { contentPath: "/a" },
      finalAcceptance: { id: "acc6", current: true, acceptedArtifactId: "art6", variant: "VERTICAL", status: "ACCEPTED" },
    }),
  ];
  assert.deepEqual(eligiblePublishVideos(sixCompleted).map((item) => item.id), ["v6"]);

  const newerUnaccepted = [
    video({
      id: "old-accepted",
      status: "COMPLETED",
      outputAsset: { contentPath: "/a" },
      finalAcceptance: { id: "acc-old", current: true, acceptedArtifactId: "art-old", variant: "VERTICAL", status: "ACCEPTED" },
    }),
    video({ id: "new-completed", status: "COMPLETED", outputAsset: { contentPath: "/a" } }),
  ];
  assert.deepEqual(eligiblePublishVideos(newerUnaccepted).map((item) => item.id), ["old-accepted"]);

  const superseded = [
    video({
      id: "old-accepted",
      status: "COMPLETED",
      outputAsset: { contentPath: "/a" },
      finalAcceptance: { id: "acc-old", current: false, acceptedArtifactId: "art-old", variant: "VERTICAL", status: "ACCEPTED" },
    }),
    video({
      id: "new-accepted",
      status: "COMPLETED",
      outputAsset: { contentPath: "/a" },
      finalAcceptance: { id: "acc-new", current: true, acceptedArtifactId: "art-new", variant: "VERTICAL", status: "ACCEPTED" },
    }),
  ];
  assert.deepEqual(eligiblePublishVideos(superseded).map((item) => item.id), ["new-accepted"]);

  const acceptedOnly = eligiblePublishVideos(sixCompleted);
  assert.equal(acceptedOnly.length, 1);
  assert.equal(pendingManualPublishVideos(sixCompleted, []).length, 1);
  assert.equal(
    pendingManualPublishVideos(sixCompleted, [publication({ id: "pub-1", status: "PENDING", videoId: "v6" })]).length,
    0,
  );
  assert.equal(acceptedOnly[0]?.id, "v6");
  assert.equal(metricsCreateOnPublish(), false);

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
  assert.equal(validateExternalUrl("https://v.douyin.com/QwZ6GP7OFUU/"), null);
  assert.equal(validateExternalUrl("not-a-url"), "请填写有效的作品链接。");
  assert.equal(validateExternalUrl("javascript:alert(1)"), "请填写有效的作品链接。");
  assert.equal(canSubmitComplete({ externalUrl: "https://www.douyin.com/video/1", externalPostId: "" }), true);
  assert.equal(canSubmitComplete({ externalUrl: "https://v.douyin.com/QwZ6GP7OFUU/", externalPostId: "" }), true);
  assert.equal(canSubmitComplete({ externalUrl: "not-a-url", externalPostId: "" }), false);
  assert.equal(canSubmitComplete(emptyCompleteForm()), false);
  assert.equal(isRegistrationFormVisible(false, true), false);
  assert.equal(isRegistrationFormVisible(true, true), true);
  assert.equal(isPublicationSourceBound({ videoId: null }), false);
  assert.equal(isPublicationSourceBound({}), false);
  assert.equal(isPublicationSourceBound({ videoId: "cb66555a-7170-4948-8d70-67809e966a38" }), true);
  assert.equal(publicationCreatedOnDeclarePublished(), false);
  assert.equal(defaultPublicationTitle(videos[0]!), "30秒沟通清单脚本");
  assert.equal(
    findDuplicatePublication(
      [publication({ id: "dup", status: "PUBLISHED", videoId: "video-ready", externalUrl: "https://v.douyin.com/QwZ6GP7OFUU/" })],
      "video-ready",
      { externalUrl: "https://v.douyin.com/QwZ6GP7OFUU/", externalPostId: "" },
    )?.id,
    "dup",
  );
  assert.equal(eligiblePublishVideos(videos).every((item) => item.finalAcceptance?.current === true), true);

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
