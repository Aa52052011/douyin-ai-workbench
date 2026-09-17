import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const dialog = read("components/ui/dialog.tsx");
  assert.match(dialog, /previousFocus/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, /aria-modal/);
  assert.match(dialog, /aria-labelledby/);
  assert.match(dialog, /Tab/);

  const css = read("app/globals.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline: 2px solid var\(--acf-brand\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.equal(/html\s*\{[^}]*overflow-x:\s*clip/.test(css), false);
  assert.equal(/body\s*\{[^}]*overflow-x:\s*clip/.test(css.replace(/\r/g, "")), false);

  const appShell = read("components/app-shell.tsx");
  assert.match(appShell, /aria-current=\{active \? "page"/);
  assert.match(appShell, /aria-expanded=\{open\}/);
  assert.match(appShell, /min-h-9/);

  const projectShell = read("components/project-shell.tsx");
  assert.match(projectShell, /aria-current=\{active \? "page"/);
  assert.match(projectShell, /aria-expanded=\{open\}/);
  assert.match(projectShell, /aria-expanded=\{foundationOpen\}/);

  const queue = read("components/script-production-queue.tsx");
  assert.match(queue, /aria-current=\{isSelected \? "true"/);
  assert.match(queue, /aria-expanded=\{open\}/);

  const button = read("components/ui/button.tsx");
  assert.match(button, /aria-busy=\{loading/);
  assert.match(button, /处理中/);

  const login = read("app/login/page.tsx");
  assert.match(login, /htmlFor="login-email"/);
  assert.match(login, /htmlFor="login-password"/);

  const topics = read("components/content-planning-topics.tsx");
  assert.match(topics, /Dialog/);
  assert.doesNotMatch(topics, /<div[^>]+onClick=\{/);

  const nextBar = read("components/next-action-bar-v1.tsx");
  assert.match(nextBar, /下一阶段/);
  assert.match(nextBar, /acf-brand/);
  assert.doesNotMatch(nextBar, /bg-\[var\(--acf-brand\)\]/);

  console.log("accessibility-phase-h selfcheck PASS");
}

run();
