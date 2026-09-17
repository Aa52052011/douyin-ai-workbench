import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  assert.match(read("app/dashboard/settings/page.tsx"), /CapabilityStatus/);
  assert.match(read("app/dashboard/settings/page.tsx"), /自动市场研究服务尚未配置/);
  assert.match(read("app/dashboard/projects/[projectId]/publish/page.tsx"), /发布运营/);
  assert.match(read("components/project-shell.tsx"), /项目资料/);
  assert.match(read("components/app-shell.tsx"), /移动主导航/);
  assert.match(read("components/app-shell.tsx"), /data-acf-app-shell-v2/);
  console.log("unified-ui selfcheck PASS");
}

run();
