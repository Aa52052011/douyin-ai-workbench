import { isRawProductionEnumVisible } from "./production-director";
import assert from "node:assert/strict";
assert.equal(isRawProductionEnumVisible("旁白"), false);
assert.equal(isRawProductionEnumVisible("REAL_FOOTAGE"), true);
console.log("production-director selfcheck PASS");
