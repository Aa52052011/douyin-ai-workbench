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
  const input = read("components/ui/input.tsx");
  const dialog = read("components/ui/dialog.tsx");
  const appShell = read("components/app-shell.tsx");
  const shell = read("components/project-shell.tsx");
  const dashboard = read("app/dashboard/page.tsx");
  const projects = read("app/dashboard/projects/page.tsx");
  const overview = read("app/dashboard/projects/[projectId]/page.tsx");
  const positioning = read("app/dashboard/projects/[projectId]/positioning/page.tsx");
  const plans = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  const scripts = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  const videos = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const review = read("app/dashboard/projects/[projectId]/performance/page.tsx");

  assert.match(css, /--acf-page:\s*#eef1ec/i);
  assert.match(css, /--acf-surface:\s*#f7f8f5/i);
  assert.match(css, /--acf-surface-muted:\s*#f2f4f0/i);
  assert.match(css, /--acf-surface-elevated:\s*#fafbf9/i);
  assert.match(css, /--acf-surface-input:\s*#fafbf9/i);
  assert.match(css, /--acf-border:\s*#d8ded9/i);
  assert.match(css, /--acf-border-strong:\s*#c8d0ca/i);
  assert.match(css, /--acf-brand:\s*#176b5b/i);
  assert.match(css, /--acf-brand-soft:\s*#e4eee9/i);
  assert.match(css, /--acf-text:\s*#1f2933/i);
  assert.match(css, /--acf-text-secondary:\s*#5f6b66/i);
  assert.match(css, /--acf-text-inverse:\s*#ffffff/i);
  assert.doesNotMatch(css, /--acf-page:\s*#ffffff/i);
  assert.doesNotMatch(css, /--acf-surface:\s*#ffffff/i);
  assert.doesNotMatch(css, /--acf-surface-elevated:\s*#ffffff/i);
  assert.equal(css.includes("linear-gradient"), false);
  assert.equal(css.includes("overflow-x: clip"), false);

  assert.match(card, /bg-\[var\(--acf-surface\)\]/);
  assert.equal(card.includes("bg-white"), false);
  assert.equal(card.includes("#ffffff"), false);
  assert.equal(card.includes("#FFFFFF"), false);

  assert.match(input, /bg-\[var\(--acf-surface-elevated\)\]/);
  assert.equal(input.includes("bg-white"), false);

  assert.match(button, /bg-\[var\(--acf-brand\)\]/);
  assert.match(button, /border-\[var\(--acf-border-strong\)\]/);
  assert.match(dialog, /bg-\[var\(--acf-surface-elevated\)\]/);
  assert.match(dialog, /if \(!isOpen\) return null/);
  assert.equal(dialog.includes("inert"), false);
  assert.equal(appShell.includes("overflow-x-clip"), false);
  assert.match(appShell, /--acf-surface-elevated/);
  assert.match(shell, /bg-\[var\(--acf-surface\)\]/);
  assert.match(css, /\.acf-stage-current/);
  assert.match(css, /\.acf-nav-done \{\s*background: transparent/);
  assert.match(shell, /acf-nav-done/);
  assert.equal(overview.includes("NextActionBarV1"), false);

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

  console.log("surface-comfort-pass selfcheck PASS");
}

run();
