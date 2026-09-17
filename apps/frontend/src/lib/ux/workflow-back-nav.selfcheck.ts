import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { resolveWorkflowBackNav } from "./workflow-back-nav";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  const pub = "01a0a54e-5f54-78c1-a558-76a8d5fcf686";
  const project = "01a0a08d-4968-70c0-a528-de2e6cecfade";

  assert.equal(resolveWorkflowBackNav({ page: "project-overview", projectId: project }).href, "/dashboard/projects");
  assert.equal(resolveWorkflowBackNav({ page: "positioning", projectId: project }).href, `/dashboard/projects/${project}`);
  assert.equal(
    resolveWorkflowBackNav({ page: "content-plan", projectId: project }).href,
    `/dashboard/projects/${project}/positioning`,
  );
  assert.equal(
    resolveWorkflowBackNav({ page: "script", projectId: project }).href,
    `/dashboard/projects/${project}/content/plans`,
  );
  assert.equal(
    resolveWorkflowBackNav({ page: "video", projectId: project }).href,
    `/dashboard/projects/${project}/content/scripts`,
  );
  assert.equal(
    resolveWorkflowBackNav({ page: "publish", projectId: project }).href,
    `/dashboard/projects/${project}/content/videos`,
  );
  assert.equal(
    resolveWorkflowBackNav({ page: "publication-detail", projectId: project, publicationId: pub }).href,
    `/dashboard/projects/${project}/publish`,
  );
  assert.equal(
    resolveWorkflowBackNav({ page: "metric-entry", publicationId: pub, projectId: project }).href,
    `/dashboard/monitoring/${pub}`,
  );
  const aiReview = resolveWorkflowBackNav({ page: "ai-review", publicationId: pub, projectId: project });
  assert.equal(aiReview.href, `/dashboard/projects/${project}/publish`);
  assert.equal(aiReview.label, "返回发布与数据");
  assert.equal(aiReview.previousStepLabel, "发布与数据");
  assert.equal(resolveWorkflowBackNav({ page: "ai-review", projectId: project }).href, `/dashboard/projects/${project}/publish`);
  assert.equal(resolveWorkflowBackNav({ page: "ai-review", publicationId: pub }).href, "/dashboard/monitoring");
  assert.equal(resolveWorkflowBackNav({ page: "ai-review" }).href, "/dashboard/monitoring");
  assert.equal(resolveWorkflowBackNav({ page: "publication-detail" }).href, "/dashboard/monitoring");

  const nav = read("src/components/workflow-back-nav-v1.tsx");
  assert.match(nav, /data-acf-workflow-back-nav-v1/);
  assert.equal(nav.includes("router.back"), false);
  assert.equal(nav.includes("history.back"), false);

  const pages = [
    "src/app/dashboard/projects/[projectId]/page.tsx",
    "src/app/dashboard/projects/[projectId]/positioning/page.tsx",
    "src/app/dashboard/projects/[projectId]/content/plans/page.tsx",
    "src/app/dashboard/projects/[projectId]/content/scripts/page.tsx",
    "src/app/dashboard/projects/[projectId]/content/videos/page.tsx",
    "src/app/dashboard/projects/[projectId]/publish/page.tsx",
    "src/app/dashboard/monitoring/page.tsx",
    "src/app/dashboard/monitoring/[publishedPostId]/page.tsx",
    "src/app/dashboard/projects/[projectId]/performance/page.tsx",
  ];
  for (const file of pages) {
    const source = read(file);
    assert.match(source, /WorkflowBackNavV1|WorkflowPageHeaderV1/);
    assert.equal(source.includes("router.back("), false);
  }

  const rec = read("src/components/recommendation-review-v5.tsx");
  assert.match(rec, /正在保存决策/);
  assert.match(read("src/lib/performance-review.view.ts"), /未审核/);
  assert.match(rec, /保存决策失败，请重试/);

  const detail = read("src/app/dashboard/monitoring/[publishedPostId]/page.tsx");
  assert.match(detail, /persistRecommendationReviewAndReload/);
  const performance = read("src/app/dashboard/projects/[projectId]/performance/page.tsx");
  assert.match(performance, /persistRecommendationReviewAndReload/);

  console.log("workflow-back-nav selfcheck PASS");
}

run();
