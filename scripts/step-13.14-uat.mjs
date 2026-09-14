/**
 * Step 13.14 browser UAT (new user + isolation + capability truth).
 * Does not print passwords. Does not modify .env.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.14-acceptance");
const base = process.env.UAT_BASE_URL || "http://localhost:3010";
const RAW = ["RUNNING", "LEAD_GENERATION", "NOT_CONFIGURED", "CostLedger", "UsageEvent", "BEST_AVAILABLE", "RIGHTS_UNKNOWN"];

function leaks(text) {
  return RAW.filter((item) => text.includes(item));
}

async function main() {
  mkdirSync(join(outDir, "desktop"), { recursive: true });
  mkdirSync(join(outDir, "mobile"), { recursive: true });
  mkdirSync(join(outDir, "tablet"), { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    base,
    desktop: { ok: false, error: null, pages: [] },
    mobile: { ok: false, error: null },
    tablet: { ok: false, error: null },
    consoleFatal: 0,
    pageErrors: [],
    brokenCtas: 0,
    rawEnumVisible: 0,
    agentInNav: false,
    tenantExposed: false,
    fakeResearch: false,
    notes: [],
    journey: [],
  };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => {
    report.consoleFatal += 1;
    report.pageErrors.push(String(err));
  });

  async function shot(folder, name) {
    await page.screenshot({ path: join(outDir, folder, name), fullPage: true });
  }

  async function audit(folder, key) {
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const found = leaks(body);
    report.rawEnumVisible += found.length;
    if (found.length) report.notes.push(`${key} leaks ${found.join(",")}`);
    if (body.includes("Tenant") || body.includes("工作空间")) report.tenantExposed = true;
    if (/研究已完成|research completed/i.test(body)) report.fakeResearch = true;
    await shot(folder, `${key}.png`);
    report[folder]?.pages?.push?.({ key, url: page.url(), leakCount: found.length });
  }

  const email = `uat1314.${Date.now()}@example.com`;
  const password = "UatPass123!";
  let projectId = "";
  let projectB = "";

  try {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await audit("desktop", "01-login");
    await page.goto(`${base}/register`, { waitUntil: "domcontentloaded" });
    await page.locator('input[placeholder="名称"]').fill("UAT14创作者");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /注册/ }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 25000 });
    report.journey.push("register");
    if (!page.url().includes("/dashboard/projects/")) {
      await page.locator("#create-project-name").fill("UAT咖啡店A");
      const industry = page.locator("#create-project-industry");
      if (await industry.count()) await industry.fill("本地餐饮");
      await page.getByRole("button", { name: /创建/ }).click();
      await page.waitForURL(/\/dashboard\/projects\/[^/]+/, { timeout: 25000 });
    }
    projectId = page.url().match(/\/dashboard\/projects\/([^/?#]+)/)?.[1] || "";
    if (!projectId) throw new Error("no project A");
    report.journey.push("project-a");
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("[data-acf-next-action]", { timeout: 15000 });
    report.journey.push("hard-refresh");
    await audit("desktop", "02-home");

    await page.goto(`${base}/dashboard/projects/${projectId}/product`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "03-product");
    await page.goto(`${base}/dashboard/projects/${projectId}/market/research`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "04-market");
    await page.goto(`${base}/dashboard/projects/${projectId}/content/plans`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "05-plans");
    await page.goto(`${base}/dashboard/projects/${projectId}/assets`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "06-assets");
    await page.goto(`${base}/dashboard/projects/${projectId}/content/videos`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "07-videos");
    await page.goto(`${base}/dashboard/projects/${projectId}/publish`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "08-publish");
    await page.goto(`${base}/dashboard/projects/${projectId}/performance`, { waitUntil: "domcontentloaded" });
    await audit("desktop", "09-data");
    await page.goto(`${base}/dashboard/settings`, { waitUntil: "domcontentloaded" });
    const settings = (await page.locator("body").innerText()) || "";
    if (!settings.includes("尚未配置") && !settings.includes("未配置")) {
      report.notes.push("settings missing not-configured copy");
    }
    await audit("desktop", "10-settings");

    await page.goto(`${base}/dashboard/projects`, { waitUntil: "domcontentloaded" });
    await page.locator("#create-project-name").fill("UAT隔离项目B");
    await page.getByRole("button", { name: /创建/ }).click();
    await page.waitForURL(/\/dashboard\/projects\/[^/]+/, { timeout: 25000 });
    projectB = page.url().match(/\/dashboard\/projects\/([^/?#]+)/)?.[1] || "";
    if (projectB === projectId) report.notes.push("project B id equals A");
    report.journey.push("project-b");
    await page.waitForSelector("[data-acf-next-action]", { timeout: 15000 });
    const homeB = (await page.locator("body").innerText()) || "";
    if (homeB.includes("UAT咖啡店A") && projectB) {
      report.notes.push("possible project isolation leak on home");
    }
    await audit("desktop", "11-project-b");

    await page.goto(`${base}/dashboard/videos`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/dashboard/videos")) report.notes.push("legacy videos not redirected");
    await shot("desktop", "12-legacy-videos.png");

    await page.goto(`${base}/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-acf-next-action]", { timeout: 15000 });
    await audit("desktop", "13-home-a-again");
    report.desktop.ok = true;
  } catch (error) {
    report.desktop.error = String(error);
    report.notes.push(`desktop: ${error}`);
    await shot("desktop", "99-error.png").catch(() => {});
  }

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    if (page.url().includes("/login") && projectId) {
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole("button", { name: /登录/ }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    }
    for (const [key, path] of [
      ["01-home", `/dashboard/projects/${projectId}`],
      ["02-plans", `/dashboard/projects/${projectId}/content/plans`],
      ["03-videos", `/dashboard/projects/${projectId}/content/videos`],
      ["04-data", `/dashboard/projects/${projectId}/performance`],
      ["05-settings", `/dashboard/settings`],
    ]) {
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await shot("mobile", `${key}.png`);
    }
    report.mobile.ok = true;
  } catch (error) {
    report.mobile.error = String(error);
  }

  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${base}/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
    await shot("tablet", "01-home.png");
    report.tablet.ok = true;
  } catch (error) {
    report.tablet.error = String(error);
  }

  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.projectA = projectId;
  report.projectB = projectB;
  writeFileSync(join(outDir, "journey.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.desktop.ok && report.mobile.ok, consoleFatal: report.consoleFatal, rawEnumVisible: report.rawEnumVisible, notes: report.notes, journey: report.journey }, null, 2));
  if (!report.desktop.ok || !report.mobile.ok) process.exit(2);
}

main();
