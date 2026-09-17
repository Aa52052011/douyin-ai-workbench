import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV } from "./global-nav";
import { PROJECT_MAIN_NAV } from "./project-nav";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const css = read("app/globals.css");
  const button = read("components/ui/button.tsx");
  const card = read("components/ui/card.tsx");
  const shell = read("components/project-shell.tsx");
  const stage = read("components/next-action-card.tsx");
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");
  const appShell = read("components/app-shell.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const projects = read("app/dashboard/projects/page.tsx");
  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  const plans = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  const scripts = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  const videos = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const review = read("app/dashboard/projects/[projectId]/performance/page.tsx");
  const queue = read("components/script-production-queue.tsx");
  const focus = read("components/content-planning-current-focus.tsx");
  const topics = read("components/content-planning-topics.tsx");
  const dialog = read("components/ui/dialog.tsx");

  assert.match(css, /--acf-page:\s*#eef1ec/i);
  assert.match(css, /--acf-surface:\s*#f7f8f5/i);
  assert.match(css, /--acf-surface-muted:\s*#f2f4f0/i);
  assert.match(css, /--acf-border:\s*#d8ded9/i);
  assert.match(css, /--acf-border-strong:\s*#c8d0ca/i);
  assert.match(css, /--acf-brand:\s*#176b5b/i);
  assert.match(css, /--acf-brand-hover:\s*#125648/i);
  assert.match(css, /--acf-brand-active:\s*#0f4a3f/i);
  assert.match(css, /--acf-brand-soft:\s*#e4eee9/i);
  assert.match(css, /--acf-success:\s*#4c8a6a/i);
  assert.match(css, /--acf-success-soft:\s*#edf5f0/i);
  assert.match(css, /--acf-info-soft:\s*#eef4f3/i);
  assert.match(css, /--acf-warning:\s*#a96f18/i);
  assert.equal(css.includes("linear-gradient"), false);
  assert.equal(css.includes("overflow-x: clip"), false);

  assert.match(button, /bg-\[var\(--acf-brand\)\]/);
  assert.match(button, /shadow-none/);
  assert.match(button, /border-\[var\(--acf-border-strong\)\]/);
  assert.match(card, /action: "border border-\[var\(--acf-border\)\]/);
  assert.match(css, /\.acf-stage-current/);
  assert.match(css, /border-color: var\(--acf-border\)/);
  assert.doesNotMatch(css, /\.acf-stage-current \{[^}]*brand-border/);

  assert.match(shell, /acf-nav-page/);
  assert.match(shell, /acf-nav-workflow/);
  assert.match(shell, /acf-nav-current/);
  assert.match(css, /\.acf-nav-workflow \{\s*background: transparent/);
  assert.match(css, /\.acf-nav-done \{\s*background: transparent/);
  assert.match(shell, /acf-nav-done/);

  assert.match(stage, /acf-stage-current/);
  assert.match(focus, /acf-stage-current/);
  assert.match(topics, /acf-stage-current/);
  assert.match(queue, /bg-\[var\(--acf-brand-soft\)\]/);
  assert.equal(queue.includes("border-[var(--acf-brand-border)]"), false);
  assert.equal(overview.includes("NextActionBarV1"), false);
  assert.equal(appShell.includes("overflow-x-clip"), false);
  assert.equal(dialog.includes("inert"), false);
  assert.match(dialog, /if \(!isOpen\) return null/);

  assert.match(dashboard, /工作台/);
  assert.match(projects, /\/dashboard\/projects/);
  assert.match(overview, /项目概览/);
  assert.match(positioning, /账号定位/);
  assert.match(plans, /内容计划/);
  assert.match(scripts, /选题与脚本/);
  assert.match(videos, /视频/);
  assert.match(publish, /发布与数据/);
  assert.match(review, /AI复盘/);
  assert.deepEqual(
    PROJECT_MAIN_NAV.map((item) => item.label),
    ["项目概览", "账号定位", "内容计划", "选题与脚本", "视频制作", "发布与数据", "AI复盘"],
  );
  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );

  console.log("color-comfort-polish selfcheck PASS");
}

run();
