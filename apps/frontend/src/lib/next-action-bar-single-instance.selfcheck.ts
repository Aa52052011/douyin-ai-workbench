import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hideProjectShellNextActionBar } from "./project-nav";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run() {
  const overviewPage = readFileSync(join(root, "app/dashboard/projects/[projectId]/page.tsx"), "utf8");
  const shell = readFileSync(join(root, "components/project-shell.tsx"), "utf8");

  assert.equal(overviewPage.includes("NextActionBarV1"), false);
  assert.equal(overviewPage.includes("adjacentProjectNav"), false);
  assert.match(overviewPage, /NextActionCard/);
  assert.match(shell, /hideProjectShellNextActionBar/);

  const projectId = "proj-1";
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${projectId}`, projectId), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${projectId}/positioning`, projectId), true);
  assert.equal(hideProjectShellNextActionBar(`/dashboard/projects/${projectId}/product`, projectId), false);

  console.log("next-action-bar-single-instance selfcheck PASS");
}

run();
