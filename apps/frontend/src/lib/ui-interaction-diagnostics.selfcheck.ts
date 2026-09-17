import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const lib = read("lib/ui-interaction-diagnostics.ts");
  assert.match(lib, /elementsFromPoint/);
  assert.match(lib, /elementFromPoint/);
  assert.match(lib, /HIT_TEST_REPORT/);
  assert.match(lib, /CLICK_CAPTURE/);
  assert.match(lib, /watchClicks/);
  assert.match(lib, /inert/);
  assert.match(lib, /::before/);
  assert.match(lib, /iframe/);
  assert.match(lib, /getBoundingClientRect/);
  assert.equal(lib.includes("preventDefault"), false);

  const providers = read("components/app-providers.tsx");
  assert.match(providers, /process.env.NODE_ENV !== "development"/);
  assert.match(providers, /ui-interaction-diagnostics/);
  assert.equal(providers.includes("UiInteractionDiagnosticsDev"), false);

  console.log("ui-interaction-diagnostics selfcheck PASS");
}

run();
