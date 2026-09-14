import assert from "node:assert/strict";
import { formatBusinessGoalDisplay, normalizeBusinessGoal } from "./business-goal";
assert.equal(formatBusinessGoalDisplay(normalizeBusinessGoal({ businessGoal: "种草" })), "种草");
console.log("business-goal selfcheck PASS");
