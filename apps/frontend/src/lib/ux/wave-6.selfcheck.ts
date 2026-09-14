import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UX_GLOBAL_PRINCIPLES_V1, UX_PRINCIPLE_COUNT } from "./principles";
import { CONTEXTUAL_GUIDANCE, FIRST_RUN_STEPS } from "./onboarding-v1";
import { sanitizeReuseContext, sourceHint } from "./field-source";
import { resolveWorkflowStagesV2 } from "./workflow-stages";
import { emptyStatusFacts } from "../project-status";
import { STATUS_VOCABULARY_MIGRATION_V6, UX_TRUTH_FORBIDDEN_CLAIMS } from "./status-migration-v6";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  assert.equal(UX_PRINCIPLE_COUNT, 14);
  assert.equal(UX_GLOBAL_PRINCIPLES_V1.every((item) => item.status === "ACTIVE"), true);
  assert.equal(UX_GLOBAL_PRINCIPLES_V1.some((item) => item.id === "UX-G13"), true);
  assert.equal(UX_GLOBAL_PRINCIPLES_V1.some((item) => item.id === "UX-G14"), true);

  const dashboard = read("src/app/dashboard/page.tsx");
  assert.match(dashboard, /FirstRunOnboardingV1/);
  assert.match(dashboard, /开始创建第一个项目/);
  assert.equal(FIRST_RUN_STEPS.length, 4);
  assert.equal(dashboard.includes("一次介绍全部功能") || read("src/components/first-run-onboarding-v1.tsx").includes("不会一次介绍全部功能"), true);

  const guidance = read("src/components/contextual-guidance-v1.tsx");
  assert.match(guidance, /ContextualGuidanceV1/);
  assert.match(read("src/components/production-context-header.tsx"), /ContextualGuidanceV1/);
  assert.equal(Boolean(CONTEXTUAL_GUIDANCE.positioning.body.includes("后续计划和脚本会自动复用")), true);

  const login = read("src/app/login/page.tsx");
  assert.match(login, /htmlFor="login-email"/);
  assert.match(login, /htmlFor="login-password"/);
  assert.match(login, /FormField/);

  const dialog = read("src/components/ui/dialog.tsx");
  assert.match(dialog, /aria-labelledby/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, /aria-label="关闭对话框"/);
  assert.match(dialog, /previousFocus/);

  const button = read("src/components/ui/button.tsx");
  assert.match(button, /min-h-9/);
  const help = read("src/components/ui/inline-help.tsx");
  assert.match(help, /aria-label/);

  const header = read("src/components/page-header.tsx");
  assert.match(header, /acf-page-title/);
  assert.equal((header.match(/<h1/g) ?? []).length, 1);

  const stages = resolveWorkflowStagesV2("p1", emptyStatusFacts());
  assert.equal(stages.length, 8);
  assert.deepEqual(
    stages.map((item) => item.label),
    ["账号定位", "内容计划", "选题与脚本", "视频制作", "审核与导出", "手动发布", "数据监控", "AI复盘"],
  );

  assert.equal(sourceHint("USER_OVERRIDDEN")?.includes("已永久保存"), false);
  const cleaned = sanitizeReuseContext({ accessToken: "x", apiKey: "y", industry: "教育" });
  assert.equal("accessToken" in cleaned, false);
  assert.equal("apiKey" in cleaned, false);
  assert.equal(cleaned.industry, "教育");

  const settings = read("src/app/dashboard/settings/page.tsx");
  assert.match(settings, /高级设置/);
  assert.equal(settings.toLowerCase().includes("sk-"), false);

  const rec = read("src/components/recommendation-review-v5.tsx");
  assert.equal(rec.includes("已永久保存"), false);
  assert.equal(rec.includes("已自动应用"), false);

  const performance = read("src/app/dashboard/projects/[projectId]/performance/page.tsx");
  assert.equal(performance.includes("完整AI复盘已完成"), false);
  assert.match(performance, /不是完整分析代理的全部能力/);

  const publish = read("src/app/dashboard/projects/[projectId]/publish/page.tsx");
  assert.equal(publish.includes("下载完成"), false);
  assert.equal(publish.includes("平台已验证"), false);

  for (const claim of UX_TRUTH_FORBIDDEN_CLAIMS) {
    assert.equal(dashboard.includes(claim), false, claim);
  }

  assert.equal(STATUS_VOCABULARY_MIGRATION_V6.dualSystems.length, 2);
  assert.match(read("src/lib/ui-labels.ts"), /uiStatusLabel/);
  assert.match(read("src/lib/ux/status-map.ts"), /productStatusLabel/);

  const empty = read("src/components/empty-state.tsx");
  assert.match(empty, /var\(--acf-surface\)/);

  const motion = read("src/app/globals.css");
  assert.match(motion, /prefers-reduced-motion/);

  const known = [
    "REVIEW_SESSION_FACT_DATA_GAP",
    "AI_CONVERSATION_CONTEXT_DATA_GAP",
    "FULL_PERFORMANCE_ANALYSIS_UI_BINDING",
    "RECOMMENDATION_REVIEW_PERSISTENCE",
    "FINAL_ACCEPTANCE_PERSISTENCE_UI_GAP",
    "LANDSCAPE_EXPORT_LIMITATION",
    "BROWSER_VISUAL_ACCEPTANCE",
  ];
  assert.equal(known.length, 7);

  console.log("ux-wave6 selfcheck PASS");
}

run();
