import assert from "node:assert/strict";
import { displayMetricValue } from "./performance.view";
import { formatTrendDelta } from "./publish.workspace";
import { trendPercent } from "./ux/publication-monitoring-v5";

function run() {
  assert.equal(displayMetricValue(0), "0");
  assert.equal(displayMetricValue(null), "—");
  assert.equal(displayMetricValue(undefined), "—");
  assert.equal(trendPercent(0, 1), null);
  assert.equal(formatTrendDelta(0, 1).delta, "+1");
  assert.equal(formatTrendDelta(0, 1).percent, null);
  assert.equal(formatTrendDelta(100, 150).percent, "50%");
  console.log("metric-zero selfcheck PASS");
}

run();
