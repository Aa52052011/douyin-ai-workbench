import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROJECT_PLATFORM,
  PROJECT_PLATFORM_ENABLED_IDS,
  PROJECT_PLATFORM_FIELD_LABEL,
  PROJECT_PLATFORM_OPTIONS,
  isEnabledProjectPlatform,
  normalizeProjectPlatform,
  projectPlatformApiValue,
  projectPlatformLabel,
  projectPlatformSelectValue,
} from "./project-platform";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function run() {
  assert.equal(DEFAULT_PROJECT_PLATFORM, "douyin");
  assert.deepEqual([...PROJECT_PLATFORM_ENABLED_IDS], ["douyin"]);
  assert.equal(PROJECT_PLATFORM_OPTIONS.some((item) => item.id === "kuaishou" && !item.enabled), true);
  assert.equal(PROJECT_PLATFORM_OPTIONS.some((item) => item.id === "xiaohongshu" && !item.enabled), true);
  assert.equal(PROJECT_PLATFORM_FIELD_LABEL, "目标发布/运营平台");

  assert.equal(normalizeProjectPlatform(null), null);
  assert.equal(normalizeProjectPlatform(""), null);
  assert.equal(normalizeProjectPlatform("douyin"), "douyin");
  assert.equal(normalizeProjectPlatform("DOUYIN"), "douyin");
  assert.equal(normalizeProjectPlatform("抖音"), "douyin");
  assert.equal(normalizeProjectPlatform("unknown-platform"), null);

  assert.equal(projectPlatformSelectValue(null), "douyin");
  assert.equal(projectPlatformSelectValue("抖音"), "douyin");
  assert.equal(projectPlatformSelectValue("weird"), "douyin");

  assert.equal(projectPlatformLabel(null), "抖音");
  assert.equal(projectPlatformLabel("douyin"), "抖音");
  assert.equal(projectPlatformLabel("抖音"), "抖音");
  assert.equal(projectPlatformLabel("legacy-free-text"), "legacy-free-text");

  assert.equal(projectPlatformApiValue(null), "douyin");
  assert.equal(projectPlatformApiValue("抖音"), "douyin");
  assert.equal(projectPlatformApiValue("kuaishou"), "douyin");
  assert.equal(isEnabledProjectPlatform("douyin"), true);
  assert.equal(isEnabledProjectPlatform("kuaishou"), false);

  const createForm = readFileSync(path.join(root, "src/components/create-project-form.tsx"), "utf8");
  assert.match(createForm, /ProjectPlatformSelect/);
  assert.match(createForm, /projectPlatformApiValue/);
  assert.doesNotMatch(createForm, /placeholder=\"平台\"/);

  const editForm = readFileSync(path.join(root, "src/components/edit-project-panel.tsx"), "utf8");
  assert.match(editForm, /ProjectPlatformSelect/);
  assert.doesNotMatch(editForm, /placeholder=\"平台\"/);

  const select = readFileSync(path.join(root, "src/components/project-platform-select.tsx"), "utf8");
  assert.match(select, /htmlFor=\{id\}/);
  assert.match(select, /PROJECT_PLATFORM_FIELD_LABEL/);
  assert.match(select, /filter\(\(item\) => item\.enabled\)/);
  assert.doesNotMatch(select, /kuaishou.*enabled:\s*true/);

  const overview = readFileSync(path.join(root, "src/app/dashboard/projects/[projectId]/page.tsx"), "utf8");
  assert.match(overview, /projectPlatformLabel/);
  assert.match(overview, /目标平台/);

  console.log("project-platform selfcheck PASS");
}

run();
