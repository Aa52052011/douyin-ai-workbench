type HitEl = {
  tag: string;
  id: string;
  className: string;
  zIndex: string;
  position: string;
  pointerEvents: string;
  visibility: string;
  opacity: string;
  display: string;
  inert: boolean;
  ariaHidden: string | null;
  rect: { x: number; y: number; w: number; h: number };
  bg: string;
};

export type AcfUiDiagApi = {
  report: () => Record<string, unknown>;
  watchClicks: () => () => void;
};

function css(el: Element, pseudo?: string): CSSStyleDeclaration {
  return window.getComputedStyle(el, pseudo);
}

function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect();
}

function describe(el: Element | null): HitEl | null {
  if (!el || !(el instanceof Element)) return null;
  const s = css(el);
  const r = rectOf(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    className: typeof el.className === "string" ? el.className.slice(0, 240) : "",
    zIndex: s.zIndex,
    position: s.position,
    pointerEvents: s.pointerEvents,
    visibility: s.visibility,
    opacity: s.opacity,
    display: s.display,
    inert: "inert" in el && Boolean((el as HTMLElement).inert),
    ariaHidden: el.getAttribute("aria-hidden"),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    bg: s.backgroundColor,
  };
}

function path(el: Element | null): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && parts.length < 12) {
    const id = cur.id ? `#${cur.id}` : "";
    const cls = typeof cur.className === "string" && cur.className.trim()
      ? `.${cur.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    parts.push(`${cur.tagName.toLowerCase()}${id}${cls}`);
    cur = cur.parentElement;
  }
  return parts.join(" < ");
}

function hitStack(x: number, y: number) {
  const list = document.elementsFromPoint(x, y).slice(0, 10);
  return {
    x,
    y,
    top: describe(document.elementFromPoint(x, y)),
    stack: list.map((el) => ({ ...describe(el), path: path(el) })),
  };
}

function coveringLayers() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: Array<Record<string, unknown>> = [];
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const s = css(el);
    if (!["fixed", "absolute", "sticky"].includes(s.position)) continue;
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (s.pointerEvents === "none") continue;
    const r = rectOf(el);
    if (r.width < vw * 0.8 || r.height < vh * 0.8) continue;
    out.push({
      ...describe(el),
      path: path(el),
      opacity: s.opacity,
      background: s.backgroundColor,
      pointerEvents: s.pointerEvents,
      clue: el.getAttribute("data-acf-dialog-overlay") || el.getAttribute("role") || el.dataset.acfAppShellV2 || "",
    });
  }
  return out;
}

function pointerChain() {
  const roots = [
    document.documentElement,
    document.body,
    document.getElementById("__next"),
    document.querySelector("[data-acf-app-shell-v2]"),
    document.querySelector("header"),
    document.querySelector("main"),
  ].filter(Boolean) as Element[];
  return roots.map((el) => {
    const ancestors: Array<Record<string, unknown>> = [];
    let cur: Element | null = el;
    while (cur) {
      const s = css(cur);
      ancestors.push({
        path: path(cur),
        pointerEvents: s.pointerEvents,
        overflow: `${s.overflowX}/${s.overflowY}`,
        inert: "inert" in cur && Boolean((cur as HTMLElement).inert),
        position: s.position,
      });
      cur = cur.parentElement;
    }
    return { root: path(el), ancestors };
  });
}

function inertScan() {
  return [...document.querySelectorAll("[inert]")].map((el) => ({
    path: path(el),
    snippet: el.outerHTML.slice(0, 200),
  }));
}

function ariaHiddenScan() {
  return [...document.querySelectorAll('[aria-hidden="true"]')].slice(0, 40).map((el) => ({
    path: path(el),
    containsShell: Boolean(el.querySelector("[data-acf-app-shell-v2], main, header")),
  }));
}

function dialogScan(): Array<Record<string, unknown>> {
  const sel = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    "[data-radix-portal]",
    '[data-state="open"]',
    "[data-acf-dialog-overlay]",
  ].join(",");
  const named = [...document.querySelectorAll(sel)].map((el) => ({
    ...describe(el),
    path: path(el),
    role: el.getAttribute("role"),
    ariaModal: el.getAttribute("aria-modal"),
    dataState: el.getAttribute("data-state"),
  }));
  const fixed = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const s = css(el);
      return s.position === "fixed" && s.pointerEvents !== "none";
    })
    .slice(0, 40)
    .map((el) => ({ kind: "fixed", ...describe(el), path: path(el) }));
  return [...named, ...fixed];
}

function loadingScan() {
  const needles = /loading|pending|busy|disabled|backdrop|overlay|mask|blocker|spinner/i;
  const hits: Array<Record<string, unknown>> = [];
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const cls = typeof el.className === "string" ? el.className : "";
    const id = el.id || "";
    const busy = el.getAttribute("aria-busy");
    if (!needles.test(cls) && !needles.test(id) && busy !== "true") continue;
    const r = rectOf(el);
    if (r.width < 40 && r.height < 40 && busy !== "true") continue;
    hits.push({ ...describe(el), path: path(el), ariaBusy: busy });
  }
  return hits.slice(0, 30);
}

function pseudoScan() {
  const targets = [
    document.documentElement,
    document.body,
    document.querySelector("[data-acf-app-shell-v2]"),
    document.querySelector("main"),
    document.querySelector("header"),
  ].filter(Boolean) as Element[];
  return targets.map((el) => {
    const before = css(el, "::before");
    const after = css(el, "::after");
    return {
      path: path(el),
      before: {
        content: before.content,
        position: before.position,
        display: before.display,
        pointerEvents: before.pointerEvents,
        zIndex: before.zIndex,
        inset: `${before.top} ${before.right} ${before.bottom} ${before.left}`,
        width: before.width,
        height: before.height,
      },
      after: {
        content: after.content,
        position: after.position,
        display: after.display,
        pointerEvents: after.pointerEvents,
        zIndex: after.zIndex,
        inset: `${after.top} ${after.right} ${after.bottom} ${after.left}`,
        width: after.width,
        height: after.height,
      },
    };
  });
}

function iframeScan() {
  return [...document.querySelectorAll("iframe")].map((el) => ({
    ...describe(el),
    path: path(el),
    src: el.getAttribute("src"),
  }));
}

function buttonGeometry() {
  const labels = ["工作台", "项目", "创建项目", "进入项目"];
  const found: Array<Record<string, unknown>> = [];
  const nodes = [...document.querySelectorAll("a,button,input,select,textarea,[role='button']")];
  for (const label of labels) {
    const el = nodes.find((node) => (node.textContent || "").replace(/\s+/g, " ").trim().includes(label));
    if (!el) {
      found.push({ label, found: false });
      continue;
    }
    const r = rectOf(el);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const actual = document.elementFromPoint(cx, cy);
    found.push({
      label,
      found: true,
      expected: describe(el),
      expectedPath: path(el),
      width: r.width,
      height: r.height,
      center: { x: Math.round(cx), y: Math.round(cy) },
      actualTop: describe(actual),
      actualPath: path(actual),
      match: actual === el || (actual && el.contains(actual)),
    });
  }
  return found;
}

function rootsMeta() {
  const list = [
    document.documentElement,
    document.body,
    document.getElementById("__next"),
    document.querySelector("[data-acf-app-shell-v2]"),
    document.querySelector("main"),
    document.querySelector("header"),
  ];
  return list.map((el) => {
    if (!el) return { missing: true };
    const s = css(el);
    return {
      path: path(el),
      overflow: `${s.overflow} / ${s.overflowX} / ${s.overflowY}`,
      pointerEvents: s.pointerEvents,
      position: s.position,
      inert: "inert" in el && Boolean((el as HTMLElement).inert),
      ariaHidden: el.getAttribute("aria-hidden"),
    };
  });
}

export function buildHitTestReport(): Record<string, unknown> {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const points = [
    [0.1, 0.1],
    [0.5, 0.1],
    [0.9, 0.1],
    [0.5, 0.3],
    [0.5, 0.5],
    [0.5, 0.8],
  ].map(([px, py]) => hitStack(Math.round(w * px), Math.round(h * py)));
  return {
    HIT_TEST_REPORT: true,
    href: location.href,
    viewport: { w, h },
    activeElement: describe(document.activeElement instanceof Element ? document.activeElement : null),
    points,
    coveringLayers: coveringLayers(),
    pointerChain: pointerChain(),
    inert: inertScan(),
    ariaHidden: ariaHiddenScan(),
    dialogs: dialogScan(),
    loading: loadingScan(),
    pseudos: pseudoScan(),
    iframes: iframeScan(),
    buttons: buttonGeometry(),
    roots: rootsMeta(),
  };
}

function onCapture(event: Event) {
  const pathList = event.composedPath().slice(0, 12).map((n) => {
    if (!(n instanceof Element)) return String(n);
    return path(n);
  });
  const target = event.target instanceof Element ? event.target : null;
  console.info("CLICK_CAPTURE", {
    type: event.type,
    target: describe(target),
    targetPath: path(target),
    composedPath: pathList,
  });
}

export function watchClicks(): () => void {
  const types = ["pointerdown", "mousedown", "click"] as const;
  for (const type of types) {
    window.addEventListener(type, onCapture, true);
  }
  console.info("ACF UI DIAG watching clicks (capture). Click 创建项目 once.");
  return () => {
    for (const type of types) {
      window.removeEventListener(type, onCapture, true);
    }
  };
}

export function installAcfUiDiag(): AcfUiDiagApi {
  const api: AcfUiDiagApi = {
    report: () => {
      const data = buildHitTestReport();
      console.info("HIT_TEST_REPORT", data);
      return data;
    },
    watchClicks,
  };
  window.__ACF_UI_DIAG__ = api;
  console.info("ACF UI DIAG ready. Run __ACF_UI_DIAG__.report() then __ACF_UI_DIAG__.watchClicks()");
  return api;
}

declare global {
  interface Window {
    __ACF_UI_DIAG__?: AcfUiDiagApi;
  }
}
