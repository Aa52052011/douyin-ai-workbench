import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  containsForbiddenPlatformVerifiedLie,
  publicationTruthCopy,
  registrationVerificationCopy,
  showPlatformVerified,
} from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const summary = read("components/published-post-summary-v5.tsx");
  const page = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  assert.equal(registrationVerificationCopy("USER_ASSERTED"), "用户已登记");
  assert.equal(showPlatformVerified(false), false);
  assert.equal(publicationTruthCopy().includes("尚未通过抖音接口验证"), true);
  assert.match(summary, /publicationTruthCopy/);
  assert.match(page, /publicationTruthCopy/);
  assert.match(summary, /registrationVerificationCopy\("USER_ASSERTED"\)/);
  assert.equal(page.includes("平台已验证"), false);
  assert.equal(containsForbiddenPlatformVerifiedLie(summary, false), false);
  console.log("publication-truth selfcheck PASS");
}

run();
