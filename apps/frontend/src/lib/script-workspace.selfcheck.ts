import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/content/scripts/page.tsx");
  assert.match(page, /还不能制作脚本/);
  assert.match(page, /这条内容还没有脚本/);
  assert.match(page, /AI 会根据已确认的选题生成一份可编辑脚本/);
  assert.match(page, /为本周选题生成并确认脚本/);
  assert.match(page, /生成脚本/);
  assert.match(page, /AsyncTaskProgressV1/);
  assert.match(page, /AI 正在生成脚本/);
  assert.match(page, /ScriptEditorV2/);
  assert.match(page, /ScriptReviewPanelV2/);
  assert.match(page, /确认脚本/);
  assert.match(page, /制作视频/);
  assert.match(page, /NextActionBarV1/);
  assert.match(page, /data-acf-script-current-workspace/);
  assert.match(page, /selectWorkspaceScript/);
  assert.doesNotMatch(page, /WorkspacePageShell/);
  assert.doesNotMatch(page, /data-acf-workspace-scroll/);
  assert.doesNotMatch(page, /ProductionContextHeaderV3/);
  assert.doesNotMatch(page, /data-acf-production-context-header/);
  assert.doesNotMatch(page, /下一步：视频制作/);
  assert.doesNotMatch(page, /AI稿可编辑，确认后再制作视频/);
  assert.equal((page.match(/查看选题详情/g) ?? []).length, 1);
  assert.equal(/confirm\(\)[\s\S]*createScript/.test(page), false);
  const loadBlock = page.slice(page.indexOf("void Promise.allSettled"), page.indexOf("async function generate"));
  assert.equal(loadBlock.includes("createScript"), false);
  assert.equal(loadBlock.includes("confirmScript"), false);
  assert.match(page, /保存并切换/);
  assert.match(page, /当前修改尚未保存/);
  assert.equal(page.includes("overflow-y-auto"), false);
  assert.equal(page.includes("sourceAgentRunId"), false);
  assert.equal(page.includes("topicSnapshot"), false);

  const editor = read("components/script-editor.tsx");
  assert.match(editor, /ScriptEditorV2/);
  assert.match(editor, /查看制作建议/);
  assert.equal(editor.includes("overflow-y-auto"), false);

  const queue = read("components/script-production-queue.tsx");
  assert.match(queue, /ScriptTopicQueueV1/);
  assert.match(queue, /aria-current/);
  assert.match(queue, /line-clamp-2/);
  assert.doesNotMatch(queue, /acf-section-title/);

  console.log("script-workspace selfcheck PASS");
}

run();
