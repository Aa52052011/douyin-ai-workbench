import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const shell = read("src/components/workspace-page-shell.tsx");
  assert.match(shell, /data-acf-page-type=\"workspace\"/);
  assert.match(shell, /data-acf-workspace-scroll=\"main\"/);
  assert.match(shell, /--acf-workspace-h/);
  assert.match(shell, /PageActionBar/);

  const actionBar = read("src/components/page-action-bar.tsx");
  assert.match(actionBar, /data-acf-action-bar/);
  assert.match(actionBar, /sticky bottom-0/);

  const guided = read("src/components/intake/guided-intake-shell.tsx");
  assert.match(guided, /data-acf-workspace=\"true\"/);
  assert.match(guided, /overflow-hidden/);
  assert.match(guided, /--acf-workspace-h/);

  const product = read("src/app/dashboard/projects/[projectId]/product/page.tsx");
  assert.match(product, /data-acf-page-type=\"workspace\"/);
  assert.match(product, /GuidedIntakeShell/);

  const market = read("src/app/dashboard/projects/[projectId]/market/research/page.tsx");
  assert.match(market, /data-acf-page-type=\"workspace\"/);
  assert.match(market, /GuidedIntakeShell/);
  assert.match(market, /onOpenImport/);

  const scripts = read("src/app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  assert.match(scripts, /WorkspacePageShell/);
  assert.match(scripts, /sidebar=\{actions\}/);

  const videos = read("src/app/dashboard/projects/[projectId]/content/videos/page.tsx");
  assert.match(videos, /WorkspacePageShell/);
  assert.match(videos, /sidebar=\{actions\}/);
  assert.match(videos, /重试生成/);
  assert.match(videos, /重新生成视频/);

  const projectShell = read("src/components/project-shell.tsx");
  assert.match(projectShell, /px-3 py-4 md:px-4/);
  assert.match(projectShell, /lg:w-52/);
  assert.match(projectShell, /projectPlatformLabel/);

  const strategy = read("src/app/dashboard/projects/[projectId]/strategy/page.tsx");
  assert.doesNotMatch(strategy, /WorkspacePageShell/);
  assert.doesNotMatch(strategy, /data-acf-page-type=\"workspace\"/);

  const plans = read("src/app/dashboard/projects/[projectId]/content/plans/page.tsx");
  assert.doesNotMatch(plans, /WorkspacePageShell/);

  console.log("workspace-layout selfcheck PASS");
}

run();
