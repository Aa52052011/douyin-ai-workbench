/**
 * Step 12.7 — real Chromium viewport acceptance.
 * Uses Playwright against local frontend. Screenshots stay under .local/.
 * Does not read/write user .env. Does not call paid providers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const outRoot = path.join(repoRoot, ".local", "responsive-acceptance");
const shotRoot = path.join(outRoot, "screenshots");
mkdirSync(shotRoot, { recursive: true });

const require = createRequire(path.join(outRoot, "package.json"));
const { chromium } = require("playwright");

const BASE = process.env.RESPONSIVE_BASE_URL ?? "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const suffix = randomBytes(3).toString("hex");
const email = `resp-accept-${suffix}@example.com`;
const password = `Accept-${suffix}-9a!`;
const name = `Accept ${suffix}`;

function overflowMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientWidth = doc.clientWidth;
    const overflowing = scrollWidth > clientWidth + 1;
    const offenders = [];
    if (overflowing) {
      for (const el of document.querySelectorAll("body *")) {
        if (!(el instanceof HTMLElement)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > clientWidth + 8 && rect.right > clientWidth + 8) {
          const tag = el.tagName.toLowerCase();
          const cls = (el.className && typeof el.className === "string" ? el.className : "").slice(0, 80);
          offenders.push(`${tag}.${cls}`.slice(0, 120));
          if (offenders.length >= 8) break;
        }
      }
    }
    return { scrollWidth, clientWidth, overflowing, offenders };
  });
}

async function shot(page, label) {
  const file = path.join(shotRoot, `${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(repoRoot, file).replaceAll("\\", "/");
}

async function ensureAuth(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("名称").fill(name);
  await page.getByPlaceholder("邮箱").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: /^注册$/ }).click(),
  ]);
}

async function ensureProject(page) {
  await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  let link = page.locator('a[href*="/dashboard/projects/"]');
  if ((await link.count()) === 0) {
    await page.getByPlaceholder("项目名称").fill(`Responsive ${suffix}`);
    await page.getByRole("button", { name: /创建项目/ }).click();
    await page.waitForURL(/\/dashboard\/projects\/[^/]+$/, { timeout: 20_000 });
    const url = page.url();
    const match = url.match(/\/dashboard\/projects\/([^/?#]+)/);
    if (!match) throw new Error("Project create did not navigate");
    return match[1];
  }
  const href = await link.first().getAttribute("href");
  const match = href?.match(/\/dashboard\/projects\/([^/?#]+)/);
  if (!match) throw new Error("No project id found after ensureProject");
  return match[1];
}

async function visitRoute(page, route, viewportName, findings) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(250);
  const metrics = await overflowMetrics(page);
  const entry = {
    route,
    viewport: viewportName,
    overflowing: metrics.overflowing,
    scrollWidth: metrics.scrollWidth,
    clientWidth: metrics.clientWidth,
    offenders: metrics.offenders,
  };
  findings.routes.push(entry);
  if (metrics.overflowing) {
    findings.overflows.push(entry);
  }
  return entry;
}

async function openMobileNav(page, viewport) {
  if (viewport.width >= 768) return { opened: false, links: [] };
  const menu = page.getByRole("button", { name: "菜单" });
  if ((await menu.count()) === 0) return { opened: false, links: [], missing: true };
  await menu.click();
  const links = await page.locator('nav[aria-label="移动主导航"] a').allTextContents();
  return { opened: true, links };
}

async function openProjectNav(page, viewport) {
  if (viewport.width >= 1024) {
    const links = await page.locator('nav[aria-label="项目导航"] a').allTextContents();
    return { opened: true, mode: "desktop", links };
  }
  const toggle = page.getByRole("button", { name: /项目导航|收起导航/ });
  if ((await toggle.count()) === 0) return { opened: false, missing: true, links: [] };
  const label = await toggle.first().innerText();
  if (label.includes("项目导航")) await toggle.first().click();
  const links = await page.locator('nav[aria-label="项目导航"] a').allTextContents();
  return { opened: true, mode: "mobile", links };
}

async function keyboardSmoke(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().slice(0, 40),
      outline: getComputedStyle(el).outlineStyle,
      outlineWidth: getComputedStyle(el).outlineWidth,
    };
  });
  return focused;
}

async function timezoneRoundtrip(page) {
  return page.evaluate(() => {
    const input = "2026-09-06T10:30";
    const date = new Date(input);
    const iso = date.toISOString();
    const display = new Date(iso).toLocaleString("zh-CN", { hour12: false });
    const localBack = new Date(iso);
    const hour = localBack.getHours();
    const minute = localBack.getMinutes();
    return {
      input,
      iso,
      display,
      hour,
      minute,
      ok: hour === 10 && minute === 30 && display.includes("10:30"),
    };
  });
}

async function dialogChecks(page, projectId) {
  const result = { import: null, editProject: null };
  await page.goto(`${BASE}/dashboard/projects/${projectId}/market/research`, { waitUntil: "networkidle" });
  const importBtn = page.getByRole("button", { name: /导入市场数据/ });
  if (await importBtn.count()) {
    await importBtn.first().click();
    await page.waitForTimeout(300);
    const dialog = page.locator("div.fixed.inset-0").filter({ hasText: "导入市场数据" });
    const visible = await dialog.count();
    if (visible) {
      const panel = dialog.locator("div.rounded-xl.bg-white").first();
      const box = await panel.boundingBox();
      const vp = page.viewportSize();
      const closeFocused = await page.evaluate(() => document.activeElement?.textContent?.includes("关闭"));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const stillOpenAfterEsc = (await dialog.count()) > 0 && (await dialog.first().isVisible().catch(() => false));
      if (stillOpenAfterEsc) {
        await dialog.getByRole("button", { name: "关闭" }).click();
      }
      result.import = {
        opened: true,
        withinViewport: Boolean(box && vp && box.height <= vp.height + 2 && box.width <= vp.width + 2),
        closeFocusable: Boolean(closeFocused),
        escapeCloses: !stillOpenAfterEsc,
      };
    }
  } else {
    result.import = { opened: false, reason: "import-cta-unavailable" };
  }

  await page.goto(`${BASE}/dashboard/projects/${projectId}`, { waitUntil: "networkidle" });
  const edit = page.getByRole("button", { name: "编辑项目" });
  if (await edit.count()) {
    await edit.click();
    await page.waitForTimeout(200);
    const panel = page.locator("div.fixed.inset-0").filter({ hasText: "编辑项目" });
    const cancel = panel.getByRole("button", { name: /取消|关闭/ });
    if (await cancel.count()) {
      await cancel.first().click();
    }
    result.editProject = { opened: true };
  }
  return result;
}

const findings = {
  base: BASE,
  emailUsed: email,
  routes: [],
  overflows: [],
  screenshots: [],
  navigation: {},
  keyboard: null,
  timezone: null,
  dialogs: null,
  performanceTabs390: null,
  issues: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await ensureAuth(page);
  const projectId = await ensureProject(page);
  findings.projectId = projectId;

  const formalRoutes = [
    "/dashboard",
    "/dashboard/projects",
    "/dashboard/settings",
    `/dashboard/projects/${projectId}`,
    `/dashboard/projects/${projectId}/product`,
    `/dashboard/projects/${projectId}/positioning`,
    `/dashboard/projects/${projectId}/market/research`,
    `/dashboard/projects/${projectId}/market/analysis`,
    `/dashboard/projects/${projectId}/strategy`,
    `/dashboard/projects/${projectId}/content/plans`,
    `/dashboard/projects/${projectId}/content/scripts`,
    `/dashboard/projects/${projectId}/content/videos`,
    `/dashboard/projects/${projectId}/publish`,
    `/dashboard/projects/${projectId}/performance`,
  ];

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    findings.navigation[vp.name] = {
      global: await openMobileNav(page, vp),
    };
    for (const route of formalRoutes) {
      await visitRoute(page, route, vp.name, findings);
    }
    await page.goto(`${BASE}/dashboard/projects/${projectId}`, { waitUntil: "networkidle" });
    findings.navigation[vp.name].project = await openProjectNav(page, vp);

    if (vp.name === "390x844") {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "390-dashboard"));
      await page.goto(`${BASE}/dashboard/projects/${projectId}`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "390-overview"));
      await page.goto(`${BASE}/dashboard/projects/${projectId}/performance`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "390-performance"));
      const tabs = page.locator('[role="tablist"] [role="tab"]');
      const tabCount = await tabs.count();
      if (tabCount >= 2) {
        await tabs.nth(1).click();
        await tabs.nth(0).click();
        findings.performanceTabs390 = { clickable: true, count: tabCount };
      } else {
        findings.performanceTabs390 = { clickable: tabCount > 0, count: tabCount, note: "empty-state-may-hide-tabs" };
      }
      await page.goto(`${BASE}/dashboard/projects/${projectId}/content/videos`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "390-video"));
      await page.goto(`${BASE}/dashboard/projects/${projectId}/market/research`, { waitUntil: "networkidle" });
      const importBtn = page.getByRole("button", { name: /导入/ });
      if (await importBtn.count()) {
        await importBtn.first().click();
        await page.waitForTimeout(300);
        findings.screenshots.push(await shot(page, "390-market-import"));
        await page.getByRole("button", { name: "关闭" }).click();
      }
    }
    if (vp.name === "1440x900") {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "1440-dashboard"));
      await page.goto(`${BASE}/dashboard/projects/${projectId}`, { waitUntil: "networkidle" });
      findings.screenshots.push(await shot(page, "1440-overview"));
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  findings.keyboard = await keyboardSmoke(page);
  findings.timezone = await timezoneRoundtrip(page);

  // Product brief (no paid provider) unlocks Market Import CTA.
  await page.goto(`${BASE}/dashboard/projects/${projectId}/product`, { waitUntil: "networkidle" });
  const fillProduct = page.getByRole("button", { name: "填写产品信息" });
  if (await fillProduct.count()) {
    await fillProduct.click();
    await page.locator("#productName").fill(`Accept Product ${suffix}`);
    await page.locator("#industry").fill("验收行业");
    await page.locator("#businessGoal").fill("完成响应式验收");
    await page.getByRole("button", { name: /保存/ }).click();
    await page.waitForTimeout(1200);
  }

  findings.dialogs = await dialogChecks(page, projectId);
  if (findings.dialogs?.import?.opened) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/dashboard/projects/${projectId}/market/research`, { waitUntil: "networkidle" });
    const importBtn = page.getByRole("button", { name: /导入市场数据/ });
    if (await importBtn.count()) {
      await importBtn.first().click();
      await page.waitForTimeout(300);
      findings.screenshots.push(await shot(page, "390-market-import"));
      const overflowImport = await overflowMetrics(page);
      if (overflowImport.overflowing) {
        findings.overflows.push({
          route: `/dashboard/projects/${projectId}/market/research#import`,
          viewport: "390x844",
          ...overflowImport,
        });
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }

  for (const o of findings.overflows) {
    findings.issues.push({
      severity: "V1-UX-BLOCKER",
      route: o.route,
      viewport: o.viewport,
      observation: `body/document horizontal overflow scrollWidth=${o.scrollWidth} clientWidth=${o.clientWidth}`,
      offenders: o.offenders,
    });
  }

  if (findings.dialogs?.import && findings.dialogs.import.escapeCloses === false) {
    findings.issues.push({
      severity: "POLISH",
      route: `/dashboard/projects/${projectId}/market/research`,
      viewport: "390x844",
      observation: "Import dialog Escape does not close; close button works",
    });
  }
} catch (error) {
  findings.fatal = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

writeFileSync(path.join(outRoot, "summary.json"), JSON.stringify(findings, null, 2), "utf8");
console.log(JSON.stringify(findings, null, 2));
process.exit(findings.fatal ? 2 : 0);
