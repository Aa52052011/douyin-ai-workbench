import assert from "node:assert/strict";
import { hoursSince } from "./performance.form";
import { metricHistoryRows } from "./performance.view";

function run() {
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T14:20:00.000Z"), "9 分钟");
  const rows = metricHistoryRows(
    [
      { observedAt: "2026-09-15T14:11:00.000Z", views: 96, likes: 31, comments: 10, shares: 3, favorites: 3, newFollowers: 0 },
      { observedAt: "2026-09-15T14:20:00.000Z", views: 115, likes: 42, comments: 12, shares: 5, favorites: 6, newFollowers: 1 },
    ],
    "2026-09-15T14:00:00.000Z",
  );
  assert.equal(rows[0]?.hoursLabel, "9 分钟");
  assert.equal(rows[0]?.views, "115");
  assert.equal(rows[1]?.comments, "10");
  console.log("observation-duration selfcheck PASS");
}

run();
