import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectSuccessHref } from "./ux/create-project-flow";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  assert.equal(createProjectSuccessHref("proj_1"), "/dashboard/projects/proj_1/positioning");
  const form = read("components/create-project-form.tsx");
  assert.match(form, /正在创建项目/);
  assert.match(form, /InlineActionErrorV1/);
  assert.match(form, /disabled=\{pending\}/);
  assert.match(form, /layout === "panel"/);
  assert.match(form, /md:grid-cols-2/);
  assert.match(form, /取消/);
  const dashboard = read("app/dashboard/page.tsx");
  assert.match(dashboard, /createProjectSuccessHref/);
  assert.match(dashboard, /创建项目/);
  const list = read("app/dashboard/projects/page.tsx");
  assert.match(list, /createProjectSuccessHref/);
  assert.match(list, /创建项目/);
  assert.match(list, /已有项目/);
  assert.match(list, /line-clamp-2/);
  assert.match(list, /layout="panel"/);
  assert.match(list, /setShowCreate/);
  assert.equal(list.includes("router.push(`/dashboard/projects/${project.id}`)"), false);
  assert.equal(list.includes("bg-[var(--acf-brand)]"), false);
  console.log("create-project-flow selfcheck PASS");
}

run();
