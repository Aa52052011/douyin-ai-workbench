/**
 * Cycle B browser UAT — login existing Cycle B user, desktop/mobile/tablet.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
const base = process.env.UAT_BASE_URL || "http://localhost:3010";
const cred = JSON.parse(readFileSync(join(dir, "credentials.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8"));
const RAW = ["RUNNING", "LEAD_GENERATION", "NOT_CONFIGURED", "CostLedger", "UsageEvent", "BEST_AVAILABLE", "RIGHTS_UNKNOWN"];

mkdirSync(join(dir, "desktop"), { recursive: true });
mkdirSync(join(dir, "mobile"), { recursive: true });
mkdirSync(join(dir, "tablet"), { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  consoleFatal: 0,
  pageErrors: [],
  rawEnumVisible: 0,
  brokenCtas: 0,
  pages: [],
  notes: [],
};

function leaks(text) {
  return RAW.filter((item) => text.includes(item));
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});

async function runViewport(name, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (err) => {
    report.consoleFatal += 1;
    report.pageErrors.push(`${name}:${err}`);
  });
  async function go(path, key) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(400);
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const found = leaks(body);
    report.rawEnumVisible += found.length;
    if (found.length) report.notes.push(`${name}:${key} ${found.join(",")}`);
    if (body.includes("7天") || /Day\s*\d/.test(body)) report.notes.push(`${name}:${key} calendar-copy`);
    await page.screenshot({ path: join(dir, name, `${key}.png`), fullPage: true });
    report.pages.push({ name, key, url: page.url(), leakCount: found.length });
    return body;
  }

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(cred.emailA);
  await page.locator('input[type="password"]').fill(cred.password);
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await go(`/dashboard/projects/${ids.projectId}`, "home");
  await page.reload({ waitUntil: "load" });
  const home = await go(`/dashboard/projects/${ids.projectId}`, "home-f5");
  if (home.includes("创建第一批内容")) report.notes.push(`${name}:home still first-batch CTA`);
  await go(`/dashboard/projects/${ids.projectId}/content/plans`, "content");
  await go(`/dashboard/projects/${ids.projectId}/content/videos`, "production");
  await go(`/dashboard/projects/${ids.projectId}/content/videos/${ids.videoId}`, "video-detail");
  const videoPage = page;
  const videoEl = videoPage.locator("video");
  if (await videoEl.count()) {
    report.notes.push(`${name}:video-element=${await videoEl.count()}`);
  }
  await go(`/dashboard/projects/${ids.projectId}/assets`, "assets");
  await go(`/dashboard/projects/${ids.projectId}/performance`, "data");
  await go(`/dashboard/settings`, "settings");
  await go(`/dashboard/projects/${ids.isolationId}`, "project-b");
  await page.close();
}

try {
  await runViewport("desktop", 1440, 900);
  await runViewport("mobile", 390, 844);
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(cred.emailA);
  await page.locator('input[type="password"]').fill(cred.password);
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await page.goto(`${base}/dashboard/projects/${ids.projectId}`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: join(dir, "tablet", "home.png"), fullPage: true });
  await page.close();
  report.tablet = "ok";
} catch (err) {
  report.error = String(err);
}
await browser.close();
report.finishedAt = new Date().toISOString();
writeFileSync(join(dir, "browser-uat.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ consoleFatal: report.consoleFatal, raw: report.rawEnumVisible, notes: report.notes, error: report.error }, null, 2));
