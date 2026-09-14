import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approveEnabledFromPayload,
  loadErrorCopy,
  mutationErrorCopy,
  stableApproveActionId,
  warningsDefaultAccepted,
  type ReviewPayload,
} from "./crop-review-page.model";

const loadingPayload: ReviewPayload | null = null;
assert.equal(approveEnabledFromPayload(loadingPayload, true), false);
assert.equal(warningsDefaultAccepted(), false);
assert.equal(loadErrorCopy(404), "审核不存在。");
assert.equal(loadErrorCopy(403), "无权限访问审核。");
assert.equal(loadErrorCopy(403, "WORKSPACE_FORBIDDEN"), "当前工作区/项目与审核不匹配。");
assert.equal(loadErrorCopy(401), "登录失效，请重新登录。");
assert.equal(loadErrorCopy(500, "PERSISTENCE_FAILED"), "审核数据加载失败。");
assert.equal(mutationErrorCopy("STALE_REVIEW_SESSION").stale, true);
assert.equal(mutationErrorCopy("PERSISTENCE_FAILED").persistenceFailed, true);
assert.equal(mutationErrorCopy("PERSISTENCE_FAILED").message.includes("未批准"), true);
assert.ok(stableApproveActionId("s1", "preview:1", "pkt").startsWith("ui-approve:s1:"));
assert.equal(stableApproveActionId("s1", "preview:1", "pkt"), stableApproveActionId("s1", "preview:1", "pkt"));

const page = readFileSync(new URL("../app/dashboard/production/review/crop/[sessionId]/page.tsx", import.meta.url), "utf8");
assert.match(page, /production-v2\/crop-review\/\$\{sessionId\}/);
assert.match(page, /mediaUrl/);
assert.match(page, /preview\?\.playable/);
assert.match(page, /REVIEW PREVIEW|审核预览/);
assert.match(page, /预览需要重新生成/);
assert.match(page, /setInterval/);
assert.match(page, /生成审核预览中/);
assert.match(page, /重新生成 preview/);
assert.match(page, /disabled=\{!approveEnabled/);
assert.match(page, /useAuth/);
assert.match(page, /SOURCE_AWARE_SCREEN_RECORDING/);
assert.match(page, /720×1280/);
assert.match(page, /1080×1920/);
assert.match(page, /source-aware-preview/);
assert.match(page, /Total:|Decisions:/);
assert.match(page, /WIDE:|KEEP_CURRENT:/);
assert.match(page, /MEDIUM:|Timeline:/);
assert.match(page, /DETAIL:|Rendered:/);
assert.match(page, /SHOT_HIERARCHY_ACCEPTABLE|Editorial UAT checklist|Source-aware UAT checklist/);
assert.match(page, /Douyin Mobile View Simulator/);
assert.match(page, /APPROXIMATE_DOUYIN_MOBILE_VIEW/);
assert.match(page, /CLEAN_9_16/);
assert.match(page, /DOUYIN_APPROX/);
assert.match(page, /WIDE_CONTEXT|MEDIUM_FOCUS|DETAIL_READABLE/);
assert.match(page, /Human Review Standard: DOUYIN_DEFAULT_MOBILE_VIEW/);
assert.match(page, /SCREEN_RECORDING_UI_DEMO/);
assert.match(page, /WIDE_FIRST/);
assert.match(page, /Output Strategy:/);
assert.match(page, /DUAL_VERTICAL_AND_LANDSCAPE|outputSelection/);
assert.match(page, /Selected By:/);
assert.match(page, /Visual Approval:/);
assert.match(page, /Truth Gate:/);
assert.match(page, /Vertical Production Readiness:/);
assert.match(page, /Landscape Production Readiness:/);
assert.match(page, /WAITING_FOR_VISUAL_APPROVAL/);
assert.match(page, /WAITING_FOR_PRODUCTION_AUTHORIZATION/);
assert.match(page, /AUTHORIZED_PREPARED/);
assert.match(page, /Final Production Review/);
assert.match(page, /FINAL PRODUCTION/);
assert.match(page, /Accept Final Production/);
assert.match(page, /final-production-media/);
assert.match(page, /Artifact ID:/);
assert.match(page, /not Calibration/);
assert.match(page, /Authorize Production/);
assert.match(page, /Approved By:/);
assert.match(page, /Authorization Object:/);
assert.match(page, /Authorized By:/);
assert.match(page, /Authorization Source:/);
assert.match(page, /Explicit user message/);
assert.match(page, /1920×1080|1920x1080/);
assert.doesNotMatch(page, /localStorage\.setItem\([^)]*token/i);
assert.match(page, /explicitAction:\s*"APPROVE"/);
assert.match(page, /approvalSource:\s*"USER_UI_ACTION"/);

console.log("crop-review-page selfcheck PASS");
