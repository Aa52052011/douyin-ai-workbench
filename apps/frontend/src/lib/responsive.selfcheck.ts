import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const performanceHistory = read("src/components/performance-history.tsx");
assert.match(performanceHistory, /overflow-x-auto/);
assert.match(performanceHistory, /min-w-\[36rem\]/);
assert.match(performanceHistory, /max-w-full/);

const importWizard = read("src/components/market-import-wizard.tsx");
assert.match(importWizard, /max-h-\[92vh\]/);
assert.match(importWizard, /overflow-y-auto/);
assert.match(importWizard, /max-w-3xl/);
assert.match(importWizard, /Escape/);
assert.match(importWizard, /closeRef/);
assert.match(importWizard, /md:hidden/);

const videoDetail = read("src/components/video-detail.tsx");
assert.match(videoDetail, /className="w-full rounded-lg bg-black"/);
assert.match(videoDetail, /break-words/);

const projectShell = read("src/components/project-shell.tsx");
assert.match(projectShell, /min-w-0 flex-1/);
assert.match(projectShell, /lg:hidden/);
assert.match(projectShell, /项目导航/);

const appShell = read("src/components/app-shell.tsx");
assert.match(appShell, /md:hidden/);
assert.match(appShell, /移动主导航/);

const stageChecklist = read("src/components/stage-checklist.tsx");
assert.match(stageChecklist, /md:grid-cols-2/);
assert.match(stageChecklist, /break-words/);

const createProject = read("src/components/create-project-form.tsx");
assert.match(createProject, /flex-col/);
assert.match(createProject, /w-full/);

console.log("responsive selfcheck PASS");
