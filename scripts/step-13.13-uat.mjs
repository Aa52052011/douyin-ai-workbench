/**
 * Step 13.13 browser UAT. Writes artifacts to .local/step-13.13-acceptance/
 * Does not modify .env. Does not call paid providers.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".local/step-13.13-acceptance");
const base = process.env.UAT_BASE_URL || "http://localhost:3010";

const RAW_ENUMS = [
  "RUNNING",
  "BEST_AVAILABLE",
  "QUALITY_CHECK",
  "FOLLOW_GROWTH",
  "LEAD_GENERATION",
  "AI_ASSISTED",
  "NOT_CONFIGURED",
  "RIGHTS_UNKNOWN",
  "UsageEvent",
  "CostLedger",
  "ResearchRequest",
];

const MAIN_NAV = ["首页", "内容计划", "制作中心", "素材中心", "发布运营", "数据优化", "设置"];

function leaks(text) {
  return RAW_ENUMS.filter((item) => text.includes(item));
}

async function main() {
  mkdirSync(join(outDir, "desktop"), { recursive: true });
  mkdirSync(join(outDir, "mobile"), { recursive: true });
  mkdirSync(join(outDir, "tablet"), { recursive: true });

  const report = {
    startedAt: new Date().toISOString(),
    base,
    desktop: { ok: false, error: null, pages: [] },
    mobile: { ok: false, error: null, pages: [] },
    tablet: { ok: false, error: null, pages: [] },
    consoleFatal: 0,
    pageErrors: [],
    brokenCtas: 0,
    rawEnumVisible: 0,
    agentInNav: false,
    tenantExposed: false,
    fakeResearch: false,
    dhShownAvailable: false,
    cloneShownAvailable: false,
    sevenDayCore: false,
    notes: [],
    happyPath: [],
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    report.notes.push("Playwright chromium not available");
    report.desktop.error = String(error);
    writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.error(error);
    process.exit(1);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let projectId = "";
  const email = `uat1313.${Date.now()}@example.com`;
  const password = "UatPass123!";
  page.on("pageerror", (err) => {
    report.consoleFatal += 1;
    report.pageErrors.push(String(err));
  });

  async function shot(folder, name) {
    await page.screenshot({ path: join(outDir, folder, name), fullPage: true });
  }

  async function auditPage(folder, key, expectedBits = []) {
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const found = leaks(body);
    report.rawEnumVisible += found.length;
    if (found.length) report.notes.push(`${key} raw enums: ${found.join(",")}`);
    if (body.includes("Tenant") || body.includes("Workspace") || body.includes("工作空间")) {
      report.tenantExposed = true;
    }
    if (/\bAgents\b|Agent 测试/.test(body) && folder === "desktop") {
      report.agentInNav = true;
    }
    if (/7天计划|Day 1|Day 2/.test(body) && /内容计划|本期内容/.test(body)) {
      report.sevenDayCore = true;
    }
    if (/研究已完成|research completed/i.test(body)) report.fakeResearch = true;
    for (const bit of expectedBits) {
      if (!body.includes(bit)) report.notes.push(`${key} missing: ${bit}`);
    }
    await shot(folder, `${key}.png`);
    report[folder].pages.push({ key, url: page.url(), leakCount: found.length });
  }

  try {
    const loginRes = await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!loginRes || loginRes.status() >= 500) throw new Error(`login HTTP ${loginRes?.status()}`);
    await auditPage("desktop", "01-login");

    await page.goto(`${base}/register`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await auditPage("desktop", "02-register");

    await page.locator('input[placeholder="名称"]').fill("UAT创作者");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /注册/ }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 25000 });
    report.happyPath.push("register→dashboard");

    await page.waitForTimeout(800);
    if (!page.url().includes("/dashboard/projects/")) {
      await page.locator("#create-project-name").fill("UAT运营项目");
      const industry = page.locator("#create-project-industry");
      if (await industry.count()) await industry.fill("美妆");
      await page.getByRole("button", { name: /创建/ }).click();
      await page.waitForURL(/\/dashboard\/projects\/[^/]+/, { timeout: 25000 });
    }
    report.happyPath.push("project-home");

    const match = page.url().match(/\/dashboard\/projects\/([^/?#]+)/);
    projectId = match?.[1] || "";
    if (!projectId) throw new Error("projectId missing after create");

    await page.reload({ waitUntil: "load", timeout: 20000 });
    await page.waitForSelector("[data-acf-next-action]", { timeout: 15000 });
    if (page.url().includes("/login")) {
      throw new Error("auth hard refresh failed");
    }
    report.happyPath.push("hard-refresh-home");
    await auditPage("desktop", "03-home-refresh");

    const routes = [
      ["03-home", `/dashboard/projects/${projectId}`, ["下一步"]],
      ["04-plans", `/dashboard/projects/${projectId}/content/plans`, ["内容"]],
      ["05-scripts", `/dashboard/projects/${projectId}/content/scripts`, []],
      ["06-videos", `/dashboard/projects/${projectId}/content/videos`, ["制作中心"]],
      ["07-assets", `/dashboard/projects/${projectId}/assets`, ["素材中心"]],
      ["08-publish", `/dashboard/projects/${projectId}/publish`, ["发布"]],
      ["09-data", `/dashboard/projects/${projectId}/performance`, ["数据"]],
      ["10-product", `/dashboard/projects/${projectId}/product`, []],
      ["11-strategy", `/dashboard/projects/${projectId}/strategy`, []],
      ["12-settings", `/dashboard/settings`, ["未配置"]],
    ];

    for (const [key, path, bits] of routes) {
      const res = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      if (res && res.status() >= 400) {
        report.brokenCtas += 1;
        report.notes.push(`HTTP ${res.status()} ${path}`);
      }
      await page.waitForTimeout(400);
      await auditPage("desktop", key, bits);
    }

    const navText = (await page.locator("nav[aria-label='项目导航']").innerText().catch(() => "")) || "";
    for (const label of MAIN_NAV) {
      if (label !== "设置" && !navText.includes(label) && page.url().includes(`/projects/${projectId}`)) {
        report.notes.push(`nav missing ${label} (checked on last project page if present)`);
      }
    }
    if (navText.includes("Agent") || navText.includes("Runs") || navText.includes("Memory")) {
      report.agentInNav = true;
    }

    await page.goto(`${base}/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
    const homeNav = (await page.locator("nav[aria-label='项目导航']").innerText()) || "";
    for (const label of MAIN_NAV) {
      if (!homeNav.includes(label)) report.notes.push(`main nav missing ${label}`);
    }
    report.agentInNav = report.agentInNav || /Agent|Runs|Memory|UsageEvent/.test(homeNav);
    await shot("desktop", "13-home-nav.png");

    const settingsBody = (await (async () => {
      await page.goto(`${base}/dashboard/settings`, { waitUntil: "domcontentloaded" });
      return page.locator("body").innerText();
    })()) || "";
    if (/数字人[\s\S]{0,40}可用/.test(settingsBody) && !settingsBody.includes("尚未配置")) {
      report.dhShownAvailable = true;
    }
    if (/自定义声音[\s\S]{0,40}可用/.test(settingsBody) && !settingsBody.includes("尚未配置")) {
      report.cloneShownAvailable = true;
    }

    const legacy = await page.goto(`${base}/dashboard/videos`, { waitUntil: "domcontentloaded", timeout: 15000 });
    const legacyUrl = page.url();
    if (legacyUrl.includes("/dashboard/videos")) {
      report.notes.push(`legacy videos not redirected: ${legacyUrl} status=${legacy?.status()}`);
    }
    await shot("desktop", "14-legacy-videos.png");

    await page.goto(`${base}/dashboard/projects/${projectId}/content/videos`, { waitUntil: "domcontentloaded" });
    await auditPage("desktop", "15-videos-after-legacy");

    report.desktop.ok = true;
  } catch (error) {
    report.desktop.error = String(error);
    report.notes.push(`desktop fail: ${error}`);
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
    if (!projectId) throw new Error("mobile missing projectId");
    const mobileRoutes = [
      ["01-home", `/dashboard/projects/${projectId}`],
      ["02-plans", `/dashboard/projects/${projectId}/content/plans`],
      ["03-videos", `/dashboard/projects/${projectId}/content/videos`],
      ["04-assets", `/dashboard/projects/${projectId}/assets`],
      ["05-publish", `/dashboard/projects/${projectId}/publish`],
      ["06-data", `/dashboard/projects/${projectId}/performance`],
      ["07-settings", `/dashboard/settings`],
    ];
    for (const [key, path] of mobileRoutes) {
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(300);
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (box.scrollWidth > box.clientWidth + 24) {
        report.notes.push(`mobile overflow ${key}: ${box.scrollWidth}>${box.clientWidth}`);
      }
      await auditPage("mobile", key);
    }
    report.mobile.ok = true;
  } catch (error) {
    report.mobile.error = String(error);
    report.notes.push(`mobile fail: ${error}`);
    await shot("mobile", "99-error.png").catch(() => {});
  }

  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await shot("tablet", "01-dashboard.png");
    report.tablet.ok = true;
  } catch (error) {
    report.tablet.error = String(error);
  }

  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.desktop.ok || !report.mobile.ok) process.exit(2);
}

main();
