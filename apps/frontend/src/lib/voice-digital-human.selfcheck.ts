import assert from "node:assert/strict";
import { CLONE_NOT_CONFIGURED, DH_NOT_CONFIGURED } from "./voice-digital-human";
assert.ok(CLONE_NOT_CONFIGURED.includes("尚未配置"));
assert.ok(DH_NOT_CONFIGURED.includes("数字人"));
console.log("voice-digital-human selfcheck PASS");
