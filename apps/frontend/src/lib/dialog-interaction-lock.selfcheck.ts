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
  assert.match(dialog, /const isOpen = open === true/);
  assert.match(dialog, /if \(!isOpen\) return null/);
  assert.match(dialog, /if \(!isOpen\) return undefined/);
  assert.match(dialog, /data-acf-dialog-overlay/);
  assert.match(dialog, /document\.addEventListener\("keydown", onKey\)/);
  assert.match(dialog, /document\.removeEventListener\("keydown", onKey\)/);
  assert.equal(dialog.includes("document.body.style"), false);
  assert.equal(dialog.includes("document.documentElement.style"), false);
  assert.equal(dialog.includes("inert"), false);
  assert.equal(dialog.includes("pointer-events-none"), false);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  const preventCount = (dialog.match(/preventDefault/g) ?? []).length;
  assert.equal(preventCount, 3);

  const workflow = read("components/workflow-overview-dialog.tsx");
  assert.match(workflow, /if \(!open\) return null/);

  console.log("dialog-interaction-lock selfcheck PASS");
}

run();
