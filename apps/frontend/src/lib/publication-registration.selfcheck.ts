import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { canSubmitComplete, isRegistrationFormVisible, publicationCreatedOnDeclarePublished, validateExternalUrl } from "./publication.form";
import { registrationVerificationCopy } from "./ux/publication-monitoring-v5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function run() {
  const page = read("app/dashboard/projects/[projectId]/publish/page.tsx");
  const complete = read("components/publication-complete-form.tsx");
  const card = read("components/manual-publish-card-v5.tsx");
  assert.match(card, /我已经发布/);
  assert.match(page, /下一步：登记你刚刚发布的作品/);
  assert.match(complete, /登记作品/);
  assert.match(page, /录入第一组数据/);
  assert.match(page, /router.push\(`\/dashboard\/monitoring\/\$\{updated.id\}`\)/);
  assert.equal(isRegistrationFormVisible(true, true), true);
  assert.equal(isRegistrationFormVisible(false, true), false);
  assert.equal(publicationCreatedOnDeclarePublished(), false);
  assert.equal(validateExternalUrl("https://v.douyin.com/QwZ6GP7OFUU/"), null);
  assert.equal(canSubmitComplete({ externalUrl: "https://v.douyin.com/QwZ6GP7OFUU/", externalPostId: "" }), true);
  assert.equal(registrationVerificationCopy("USER_ASSERTED"), "用户已登记");
  const registerFn = page.slice(page.indexOf("async function register"), page.indexOf("async function download"));
  assert.equal(registerFn.includes("router.push"), false);
  console.log("publication-registration selfcheck PASS");
}

run();
