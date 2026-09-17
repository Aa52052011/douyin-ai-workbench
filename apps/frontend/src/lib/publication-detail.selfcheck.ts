import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { meaningfulLinkedVideoTitle } from "./publication.view";
import { metricHistoryRows } from "./performance.view";
import { hoursSince } from "./performance.form";
import { formatTrendDelta } from "./publish.workspace";
import { publicationTruthCopy, registrationVerificationCopy } from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const detail = read("components/publication-detail.tsx");
  const page = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const history = read("components/metrics-history-v5.tsx");
  const summary = read("components/metrics-summary-v2.tsx");

  assert.match(detail, /状态：\{statusLabel\}/);
  assert.match(detail, /登记时间/);
  assert.match(detail, /用户填写的发布时间/);
  assert.match(detail, /作品信息/);
  assert.match(detail, /关联成片/);
  assert.equal(detail.includes("来源视频："), false);
  assert.equal(detail.includes("发布时间：{view.publishedAtLabel}"), false);
  assert.match(page, /registrationVerificationCopy\("USER_ASSERTED"\)/);
  assert.match(page, /publicationTruthCopy\(\)/);
  assert.match(page, /meaningfulLinkedVideoTitle/);
  assert.match(page, /collapsedByDefault/);
  assert.match(page, /item\.id !== current\.id/);
  assert.match(page, /查看 AI复盘/);
  assert.equal(page.includes("来源视频：来源视频"), false);
  assert.equal(page.includes("平台已验证"), false);
  assert.match(history, /历史数据 \{rows.length\} 条/);
  assert.match(history, /最近观察间隔/);
  assert.match(history, /slice\(0, 3\)/);
  assert.match(summary, /新增粉丝/);
  assert.match(summary, /item.label !== "新增粉丝"/);

  assert.equal(registrationVerificationCopy("USER_ASSERTED"), "用户已登记");
  assert.equal(publicationTruthCopy().includes("尚未通过抖音接口验证"), true);
  assert.equal(
    meaningfulLinkedVideoTitle({ id: "p", status: "PUBLISHED", createdAt: "2026-01-01" }, null),
    null,
  );
  assert.equal(
    meaningfulLinkedVideoTitle(
      { id: "p", status: "PUBLISHED", createdAt: "2026-01-01", sourceVideoTitle: "来源视频" },
      { id: "v", status: "COMPLETED", createdAt: "2026-01-01", scriptTitle: "来源视频" },
    ),
    null,
  );
  assert.equal(
    meaningfulLinkedVideoTitle(
      { id: "p", status: "PUBLISHED", createdAt: "2026-01-01", sourceVideoTitle: "本周口播成片" },
      null,
    ),
    "本周口播成片",
  );
  assert.equal(
    meaningfulLinkedVideoTitle(
      { id: "p", status: "PUBLISHED", createdAt: "2026-01-01", sourceVideoTitle: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      null,
    ),
    null,
  );

  const rows = metricHistoryRows(
    [
      { observedAt: "2026-09-15T14:11:00.000Z", views: 96, likes: 31, comments: 10, shares: 3, favorites: 3, newFollowers: 0 },
      { observedAt: "2026-09-15T14:20:00.000Z", views: 115, likes: 42, comments: 12, shares: 5, favorites: 6, newFollowers: 1 },
    ],
    "2026-09-15T14:00:00.000Z",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.views, "115");
  assert.equal(rows[1]?.views, "96");
  assert.equal(rows[0]?.hoursLabel, "9 分钟");
  assert.equal(hoursSince("2026-09-15T14:11:00.000Z", "2026-09-15T14:20:00.000Z"), "9 分钟");
  assert.equal(formatTrendDelta(0, 1).delta, "+1");
  assert.equal(formatTrendDelta(0, 1).percent, null);

  console.log("publication-detail selfcheck PASS");
}

run();
