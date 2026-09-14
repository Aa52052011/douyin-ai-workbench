import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assetCardModel,
  assetRightsLabel,
  assetSourceLabel,
  assetTypeLabel,
  libraryHasRawEnumVisible,
  libraryMimeFromFile,
  libraryTypeFromFile,
  LIBRARY_MAX_UPLOAD_BYTES,
  type AssetLibraryItem,
} from "./asset-library";

const item: AssetLibraryItem = {
  id: "a1",
  projectId: "p1",
  type: "IMAGE",
  status: "READY",
  originalFilename: "cover.png",
  mimeType: "image/png",
  size: 2048,
  duration: null,
  width: 100,
  height: 100,
  sourceType: "PROJECT_UPLOAD",
  referenceOnly: false,
  reusable: true,
  rightsStatus: "USER_CONFIRMED",
  usedCount: 2,
  contentPath: "/assets/a1/content",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const card = assetCardModel(item);
assert.equal(card.typeLabel, "图片");
assert.equal(libraryTypeFromFile({ name: "a.mp4", type: "" }), "VIDEO");
assert.equal(libraryMimeFromFile({ name: "a.mp4", type: "" }), "video/mp4");
assert.equal(LIBRARY_MAX_UPLOAD_BYTES, 128 * 1024 * 1024);
const nextConfig = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
assert.match(nextConfig, /proxyClientMaxBodySize:\s*"128mb"/);
assert.doesNotMatch(nextConfig, /middlewareClientMaxBodySize/);
assert.equal(card.typeLabel, "图片");
assert.equal(card.sourceLabel, "项目上传");
assert.equal(card.rightsLabel, "用户确认可用");
assert.equal(card.reusableLabel, "可复用");
assert.equal(card.referenceOnly, false);
assert.ok(!libraryHasRawEnumVisible(`${card.typeLabel} ${card.sourceLabel} ${card.rightsLabel}`));

const ref = assetCardModel({ ...item, referenceOnly: true, sourceType: "REFERENCE", reusable: false });
assert.equal(ref.referenceOnly, true);
assert.match(ref.reusableLabel, /不可/);
assert.equal(assetSourceLabel("REFERENCE"), "参考素材");
assert.equal(assetRightsLabel("RESTRICTED"), "受限");
assert.equal(assetTypeLabel("VIDEO"), "视频");

console.log("asset-library selfcheck PASS");
