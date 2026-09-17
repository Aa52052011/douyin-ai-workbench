import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { GLOBAL_NAV } from "./global-nav";
import { hideProjectShellNextActionBar, PROJECT_MAIN_NAV } from "./project-nav";
import { ACCEPTED_ONLY_HANDOFF_COPY } from "./ai-review.workspace";
import { getStatusTone } from "./ui-labels";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const css = read("app/globals.css");
  const button = read("components/ui/button.tsx");
  const card = read("components/ui/card.tsx");
  const appShell = read("components/app-shell.tsx");
  const projectShell = read("components/project-shell.tsx");
  const dialog = read("components/ui/dialog.tsx");
  const handoff = read("components/feedback-handoff-ux-v5.tsx");
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const projects = read("app/dashboard/projects/page.tsx");
  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  const plans = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  const scripts = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  const videos = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const review = read("app/dashboard/projects/[projectId]/performance/page.tsx");

  assert.match(css, /--acf-brand:\s*#176b5b/i);
  assert.match(css, /--acf-page:\s*#eef1ec/i);
  assert.match(css, /--acf-brand-soft:/);
  assert.match(css, /--acf-success:\s*#4c8a6a/i);
  assert.match(css, /--acf-warning:\s*#a96f18/i);
  assert.equal(css.includes("linear-gradient"), false);
  assert.equal(css.includes("overflow-x: clip"), false);

  assert.match(button, /primary:/);
  assert.match(button, /bg-\[var\(--acf-brand\)\]/);
  assert.match(button, /secondary:/);
  assert.match(button, /border-\[var\(--acf-border-strong\)\]/);
  assert.equal(button.includes("bg-[var(--acf-brand)] text-[var(--acf-text-inverse)] hover:bg-[var(--acf-brand-hover)] active:bg-[var(--acf-brand-active)] disabled:bg-[var(--acf-text-disabled)]\","), false);

  assert.match(appShell, /acf-nav-active/);
  assert.match(projectShell, /acf-nav-page/);
  assert.match(projectShell, /acf-nav-workflow/);
  assert.match(projectShell, /--acf-success/);
  assert.match(css, /\.acf-nav-current/);
  assert.match(css, /\.acf-status-success/);
  assert.match(css, /\.acf-status-warning/);

  assert.equal(getStatusTone("CONFIRMED"), "success");
  assert.equal(getStatusTone("DEFERRED"), "warning");
  assert.equal(getStatusTone("REJECTED"), "neutral");
  assert.equal(getStatusTone("FAILED"), "danger");

  assert.match(dialog, /if \(!isOpen\) return null/);
  assert.equal(dialog.includes("inert"), false);
  assert.equal(appShell.includes("overflow-x-clip"), false);

  assert.equal(overview.includes("NextActionBarV1"), false);
  assert.equal((review.match(/开始下一轮内容规划/g) ?? []).length, 1);
  assert.match(handoff, /ACCEPTED_ONLY_HANDOFF_COPY/);
  assert.equal(ACCEPTED_ONLY_HANDOFF_COPY.includes("已采纳"), true);

  const pid = "proj-color";
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${pid}`, pid), true);
  assert.deepEqual(
    PROJECT_MAIN_NAV.map((item) => item.label),
    ["项目概览", "账号定位", "内容计划", "选题与脚本", "视频制作", "发布与数据", "AI复盘"],
  );
  assert.deepEqual(
    GLOBAL_NAV.map((item) => item.label),
    ["工作台", "项目", "发布与数据", "设置"],
  );

  assert.match(dashboard, /工作台/);
  assert.match(projects, /\/dashboard\/projects/);
  assert.match(overview, /项目概览/);
  assert.match(positioning, /账号定位/);
  assert.match(plans, /内容计划/);
  assert.match(scripts, /选题与脚本/);
  assert.match(videos, /视频/);
  assert.match(publish, /发布与数据/);
  assert.match(review, /AI复盘/);
  assert.match(card, /variant = "standard"/);

  console.log("visual-color-system selfcheck PASS");
}

run();
