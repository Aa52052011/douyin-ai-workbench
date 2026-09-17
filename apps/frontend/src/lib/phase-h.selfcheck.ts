import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const PRODUCT_PAGES = [
  "app/dashboard/page.tsx",
  "app/dashboard/projects/[projectId]/page.tsx",
  "app/dashboard/projects/[projectId]/positioning/page.tsx",
  "app/dashboard/projects/[projectId]/content/plans/page.tsx",
  "app/dashboard/projects/[projectId]/content/scripts/page.tsx",
  "app/dashboard/projects/[projectId]/content/videos/page.tsx",
  "app/dashboard/projects/[projectId]/publish/page.tsx",
  "app/dashboard/projects/[projectId]/performance/page.tsx",
];

const FORBIDDEN_VISIBLE = [
  "HIGH_",
  "sourceAgentRunId",
  "truth gate",
  "token usage",
  "queueId",
  "NOT_VERIFIED",
];

function run() {
  for (const rel of PRODUCT_PAGES) {
    const src = read(rel);
    for (const token of FORBIDDEN_VISIBLE) {
      if (token === "HIGH_" && src.includes("HIGH_")) {
        assert.equal(src.includes("TechnicalDetails"), true, `${rel} HIGH_ without TechnicalDetails`);
      } else if (token !== "HIGH_") {
        assert.equal(src.includes(token), false, `${rel} leaked ${token}`);
      }
    }
    assert.equal(src.includes("Prisma"), false, `${rel} Prisma`);
    assert.equal(src.includes("stack trace"), false, `${rel} stack`);
  }

  const publish = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const plans = read("app/dashboard/projects/[projectId]/content/plans/page.tsx");
  assert.match(publish, /registrationVerificationCopy\("USER_ASSERTED"\)/);
  assert.equal(publish.includes(">USER_ASSERTED<"), false);
  assert.match(plans, /开始制作第一条脚本/);
  assert.match(plans, /nextLabel=\{flow.next\?\.label\}/);
  assert.equal(plans.includes("continueHref={confirmFocusHref"), false);

  const scripts = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  assert.match(scripts, /xl:grid-cols-\[minmax\(16rem,20rem\)_minmax\(0,1fr\)\]/);
  assert.match(scripts, /isCompactQueue/);
  assert.doesNotMatch(scripts, /WorkspacePageShell/);

  const videos = read("app/dashboard/projects/[projectId]/content/videos/page.tsx");
  assert.match(videos, /max-xl:flex-col/);
  assert.doesNotMatch(videos, /WorkspacePageShell/);

  const topics = read("components/content-planning-topics.tsx");
  assert.match(topics, /data-acf-topic-row/);
  assert.doesNotMatch(topics, /grid-cols-3/);

  const positioning = read("components/positioning-summary.tsx");
  assert.match(positioning, /xl:grid-cols-2/);

  const publishSteps = read("components/publish-workflow-steps-v1.tsx");
  assert.match(publishSteps, /xl:grid-cols-5/);
  assert.match(publishSteps, /grid-cols-1/);

  const metrics = read("components/metrics-summary-v2.tsx");
  assert.match(metrics, /xl:grid-cols-3/);

  const history = read("components/metrics-history-v5.tsx");
  assert.match(history, /overflow-x-auto/);

  const empty = read("components/empty-state.tsx");
  assert.match(empty, /title/);
  assert.match(empty, /description/);
  assert.match(empty, /primaryAction/);

  const error = read("components/inline-action-error-v1.tsx");
  assert.match(error, /data-acf-inline-action-error/);

  console.log("phase-h consistency selfcheck PASS");
}

run();
