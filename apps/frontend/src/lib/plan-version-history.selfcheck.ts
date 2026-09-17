import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const history = readFileSync(path.join(root, "components/content-planning-history.tsx"), "utf8");
assert.match(history, /VersionHistoryDrawerV1/);
assert.match(history, /第\$\{item.version\}版/);
assert.match(history, /canScript=\{false\}/);
assert.match(history, /只读查看/);
console.log("plan-version-history selfcheck PASS");
