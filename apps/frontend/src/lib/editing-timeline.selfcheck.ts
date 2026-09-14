import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRawTimelineEnumVisible } from "./editing-timeline";

const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(root, "../components/production-plan-panel.tsx"), "utf8");
assert.equal(panel.includes("素材解析"), true);
assert.equal(panel.includes("时间线摘要"), true);
assert.equal(panel.includes("/videos/${videoId}/timeline"), true);
assert.equal(panel.includes("EXISTING_ASSET"), false);
assert.equal(isRawTimelineEnumVisible("已有素材"), false);
assert.equal(isRawTimelineEnumVisible("EXISTING_ASSET"), true);
console.log("editing-timeline.selfcheck: ok");
