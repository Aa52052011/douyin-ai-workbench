import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const learning = readFileSync(path.join(root, "components/learning-context-summary-v1.tsx"), "utf8");
assert.match(learning, /AI 已参考/);
assert.match(learning, /查看参考依据/);
assert.match(learning, /已确认账号定位/);
assert.match(learning, /仅作为参考/);
assert.match(learning, /不会自动修改定位或推广目标/);
assert.match(learning, /本轮不参考上一轮已采纳建议/);
assert.match(learning, /已发布作品/);
assert.match(learning, /依据：已发布作品与复盘记录/);
console.log("learning-context selfcheck PASS");
