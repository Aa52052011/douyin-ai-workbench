import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldShowFirstRunOnboarding } from "./ux/onboarding-v1";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const css = read("app/globals.css");
  assert.equal(css.includes("overflow-x: clip"), false);
  assert.equal(css.includes("overflow: hidden"), false);
  assert.doesNotMatch(css, /html\s*\{[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /body\s*\{[^}]*pointer-events:\s*none/);

  const appShell = read("components/app-shell.tsx");
  assert.equal(appShell.includes("overflow-x-clip"), false);
  assert.equal(appShell.includes("pointer-events-none"), false);
  assert.equal(appShell.includes("inert"), false);
  assert.match(appShell, /min-w-0/);

  const dialog = read("components/ui/dialog.tsx");
  assert.match(dialog, /if \(!isOpen\) return null/);
  assert.equal(dialog.includes("document.body.style.overflow"), false);
  assert.equal(dialog.includes("aria-hidden"), false);

  const firstRun = read("components/first-run-onboarding-v1.tsx");
  assert.match(firstRun, /shouldShowFirstRunOnboarding/);
  assert.equal(shouldShowFirstRunOnboarding(true, false), false);
  assert.equal(shouldShowFirstRunOnboarding(true, true), false);

  const projects = read("app/dashboard/projects/page.tsx");
  assert.equal(projects.includes("FirstRunOnboardingV1"), false);
  assert.equal(projects.includes("WorkflowOverviewDialog"), false);
  assert.equal(projects.includes("fixed inset-0"), false);

  const layout = read("app/dashboard/layout.tsx");
  assert.equal(layout.includes("Dialog"), false);
  assert.equal(layout.includes("inert"), false);

  console.log("page-interaction-unlock selfcheck PASS");
}

run();
