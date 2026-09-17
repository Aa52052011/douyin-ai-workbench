import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/dashboard/projects/[projectId]/content/videos/page.tsx"), "utf8");
const preview = readFileSync(path.join(root, "components/video-detail.tsx"), "utf8");

function run() {
  assert.match(page, /max-xl:flex-col/);
  assert.match(page, /xl:grid/);
  assert.match(page, /max-w-6xl/);
  assert.doesNotMatch(page, /WorkspacePageShell/);
  assert.equal(page.includes("overflow-y-auto"), false);
  assert.match(preview, /maxHeight/);
  assert.match(preview, /9 \/ 16/);
  assert.match(preview, /16 \/ 9/);
  console.log("video-responsive selfcheck PASS");
}

run();
