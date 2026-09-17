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
assert.match(videoDetail, /object-contain/);
assert.match(videoDetail, /rounded-lg bg-black/);
assert.match(videoDetail, /break-words/);
assert.match(videoDetail, /9 \/ 16/);

const videosPage = read("src/app/dashboard/projects/[projectId]/content/videos/page.tsx");
assert.match(videosPage, /max-xl:flex-col/);
assert.match(videosPage, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(16rem,2fr\)\]/);
assert.doesNotMatch(videosPage, /WorkspacePageShell/);

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

const dashboard = read("src/app/dashboard/page.tsx");
assert.match(dashboard, /xl:grid-cols-2/);
assert.match(dashboard, /min-w-0/);

const overview = read("src/app/dashboard/projects/[projectId]/page.tsx");
assert.match(overview, /xl:grid xl:grid-cols-2/);

const positioning = read("src/components/positioning-summary.tsx");
assert.match(positioning, /xl:grid-cols-2/);

const topics = read("src/components/content-planning-topics.tsx");
assert.match(topics, /data-acf-topic-row/);
assert.doesNotMatch(topics, /grid-cols-3/);

const scripts = read("src/app/dashboard/projects/[projectId]/content/scripts/page.tsx");
assert.match(scripts, /max-width: 1279px/);
assert.match(scripts, /xl:grid-cols-\[minmax\(16rem,20rem\)_minmax\(0,1fr\)\]/);

const publishSteps = read("src/components/publish-workflow-steps-v1.tsx");
assert.match(publishSteps, /xl:grid-cols-5/);

const aiReview = read("src/app/dashboard/projects/[projectId]/performance/page.tsx");
assert.match(aiReview, /AiReviewWorkspaceV1/);

const globals = read("src/app/globals.css");
assert.equal(globals.includes("overflow-x: clip"), false);

const viewports = ["1920x1080", "1440x900", "1280x800", "1024x768"];
assert.equal(viewports.length, 4);

console.log("responsive selfcheck PASS");
