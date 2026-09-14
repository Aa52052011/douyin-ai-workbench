/**
 * Cycle C mobile/desktop session UAT.
 * Reuses Cycle B credentials; waits for auth hydrate after F5 (product keeps access token in memory).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".local/step-13.14-acceptance/fix-cycle-c");
const credDir = join(root, ".local/step-13.14-acceptance/fix-cycle-b");
const base = process.env.UAT_BASE_URL || "http://localhost:3010";
const cred = JSON.parse(readFileSync(join(credDir, "credentials.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(credDir, "ids.json"), "utf8"));

mkdirSync(join(dir, "mobile"), { recursive: true });
mkdirSync(join(dir, "desktop"), { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  droppedToLogin: [],
  pages: [],
  notes: [],
};

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});

async function waitReady(page) {
  await page.waitForFunction(() => !document.body.innerText.includes("加载中…"), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function runViewport(name, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();

  async function go(path, key) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await waitReady(page);
    const url = page.url();
    if (url.includes("/login")) {
      report.droppedToLogin.push(`${name}:${key}:${url}`);
    }
    await page.screenshot({ path: join(dir, name, `${key}.png`), fullPage: true });
    report.pages.push({ name, key, url });
    return url;
  }

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(cred.emailA);
  await page.locator('input[type="password"]').fill(cred.password);
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 25000 });
  await waitReady(page);

  const storage = await context.storageState();
  writeFileSync(join(dir, `${name}-storage.json`), JSON.stringify(storage, null, 2));

  await go(`/dashboard/projects/${ids.projectId}`, "home");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitReady(page);
  const afterF5 = page.url();
  if (afterF5.includes("/login")) report.droppedToLogin.push(`${name}:home-f5:${afterF5}`);
  await page.screenshot({ path: join(dir, name, "home-f5.png"), fullPage: true });
  report.pages.push({ name, key: "home-f5", url: afterF5 });

  await go(`/dashboard/projects/${ids.projectId}/content/plans`, "content");
  await go(`/dashboard/projects/${ids.projectId}/content/videos`, "production");
  await go(`/dashboard/projects/${ids.projectId}/content/videos/${ids.videoId}`, "video-detail");
  await go(`/dashboard/projects/${ids.projectId}/assets`, "assets");
  await go(`/dashboard/projects/${ids.projectId}/performance`, "data");
  await go(`/dashboard/settings`, "settings");
  await context.close();
}

try {
  await runViewport("desktop", 1440, 900);
  await runViewport("mobile", 390, 844);
} catch (err) {
  report.error = String(err);
}
await browser.close();
report.finishedAt = new Date().toISOString();
report.mobilePass = !report.droppedToLogin.some((item) => item.startsWith("mobile:"));
writeFileSync(join(dir, "browser-uat.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ droppedToLogin: report.droppedToLogin, error: report.error, mobilePass: report.mobilePass }, null, 2));
