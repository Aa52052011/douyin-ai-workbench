/**
 * Step 12.12N — deterministic confidence → actionable view model.
 * Frontend only; no LLM / provider.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceAction = {
  id: string;
  label: string;
  description?: string;
  href?: string;
  actionType?: "navigate" | "info";
};

export type ConfidenceActionView = {
  label: string;
  level: ConfidenceLevel;
  reasonSummary?: string;
  recommendedActions: ConfidenceAction[];
  /** Soft framing for strategy/planning low-data (not a hard block). */
  framingNote?: string;
};

export type ConfidenceContext = "market" | "strategy" | "planning";

const UNKNOWN_LIMITATION_FALLBACK =
  "当前可用信息仍有限，建议继续补充市场素材或先执行首轮内容验证。";

const LIMITATION_REASON: Record<string, string> = {
  NO_MARKET_DATA: "目前没有可分析的市场样本。",
  LIMITED_SAMPLE: "当前市场样本较少，结论更适合作为第一轮验证方向。",
  MANUAL_ONLY: "当前调研信息主要来自人工补充，还缺少更广泛的公开样本。",
  MISSING_METRICS: "目前缺少真实内容表现数据。",
  MISSING_CONTENT_METRICS: "目前缺少真实内容表现数据。",
  UNKNOWN_SELECTION_METHOD: "样本选择方式未知，结论更适合作为验证方向。",
  NO_MARKET_INSIGHT: "本轮策略未结合市场分析，更适合先做小范围验证。",
  NO_PERFORMANCE_HISTORY: "暂无历史表现数据，建议先发布首轮内容再优化。",
  LIMITED_MARKET_SAMPLE: "当前市场样本有限，策略偏向验证型打法。",
  BRIEF_VERSION_MISMATCH: "产品信息版本与策略生成时可能不一致，建议核对后再大规模执行。",
};

function normalizeLevel(confidence?: string | null): ConfidenceLevel | null {
  switch ((confidence ?? "").trim().toUpperCase()) {
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    case "HIGH":
      return "high";
    default:
      return null;
  }
}

export function confidenceUserLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "low":
      return "可信度较低";
    case "medium":
      return "可信度一般";
    case "high":
      return "可信度较高";
  }
}

function isRawCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(value.trim());
}

/** Map raw limitation codes to user-facing reason; never expose raw enums. */
export function reasonFromLimitationCodes(codes: string[]): {
  reasonSummary: string;
  knownCodes: string[];
  unknownCodes: string[];
} {
  const knownCodes: string[] = [];
  const unknownCodes: string[] = [];
  const reasons: string[] = [];

  for (const raw of codes) {
    const code = raw.trim();
    if (!code) continue;
    const mapped = LIMITATION_REASON[code];
    if (mapped) {
      knownCodes.push(code);
      if (!reasons.includes(mapped)) reasons.push(mapped);
      continue;
    }
    if (isRawCode(code)) {
      unknownCodes.push(code);
      continue;
    }
    // Already humanized text — keep as soft reason without exposing codes.
    if (!reasons.includes(code)) reasons.push(code);
  }

  if (reasons.length === 0) {
    return {
      reasonSummary: UNKNOWN_LIMITATION_FALLBACK,
      knownCodes,
      unknownCodes,
    };
  }

  return {
    reasonSummary: reasons.slice(0, 2).join(" "),
    knownCodes,
    unknownCodes,
  };
}

function dedupeActions(actions: ConfidenceAction[]): ConfidenceAction[] {
  const seen = new Set<string>();
  const out: ConfidenceAction[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }
  return out;
}

function actionsForCodes(
  codes: string[],
  projectId: string,
  context: ConfidenceContext,
): ConfidenceAction[] {
  const href = (path: string) => `/dashboard/projects/${projectId}${path}`;
  const set = new Set(codes.map((c) => c.trim()));
  const actions: ConfidenceAction[] = [];

  const needsMarket =
    set.has("NO_MARKET_DATA") ||
    set.has("LIMITED_SAMPLE") ||
    set.has("LIMITED_MARKET_SAMPLE") ||
    set.has("MANUAL_ONLY") ||
    set.has("NO_MARKET_INSIGHT") ||
    set.has("UNKNOWN_SELECTION_METHOD");

  if (needsMarket) {
    actions.push({
      id: "add-keywords",
      label: "补充关键词",
      description: "再补充 2–3 个研究方向关键词",
      href: href("/market/research"),
      actionType: "navigate",
    });
    actions.push({
      id: "add-competitors",
      label: "添加竞品或公开链接",
      description: "补充 1–3 个竞品账号或公开内容链接",
      href: href("/market/research"),
      actionType: "navigate",
    });
  }

  if (set.has("NO_MARKET_DATA")) {
    actions.push({
      id: "low-data-continue",
      label: "先按低数据模式执行首轮内容",
      description: "不阻塞后续策略与内容制作",
      actionType: "info",
    });
  }

  if (set.has("MISSING_METRICS") || set.has("MISSING_CONTENT_METRICS") || set.has("NO_PERFORMANCE_HISTORY")) {
    actions.push({
      id: "publish-first",
      label: "先发布首轮内容",
      description: "用真实发布验证方向",
      href: href("/content/videos"),
      actionType: "navigate",
    });
    actions.push({
      id: "backfill-metrics",
      label: "回填播放/互动数据",
      description: "发布后录入表现，再优化下一轮",
      href: href("/performance"),
      actionType: "navigate",
    });
  }

  if (context === "strategy" || context === "planning") {
    actions.push({
      id: "validate-batch",
      label: "先执行 3–7 条内容验证",
      description: "把本轮当作验证，而不是最终最优方案",
      actionType: "info",
    });
  }

  if (context === "planning") {
    actions.push({
      id: "continue-script",
      label: "继续制作脚本",
      description: "低可信度不阻塞选题→脚本",
      href: href("/content/scripts"),
      actionType: "navigate",
    });
  }

  if (actions.length === 0 && codes.length > 0) {
    actions.push({
      id: "fallback-enrich",
      label: "补充市场素材或先验证首轮内容",
      description: UNKNOWN_LIMITATION_FALLBACK,
      href: href("/market/research"),
      actionType: "navigate",
    });
  }

  return dedupeActions(actions);
}

/**
 * Build user-facing confidence card model.
 * LOW always includes reason + actions. Unknown raw codes never appear in output.
 */
export function buildConfidenceActionView(input: {
  confidence?: string | null;
  limitationCodes?: string[] | null;
  projectId: string;
  context: ConfidenceContext;
}): ConfidenceActionView | null {
  const level = normalizeLevel(input.confidence);
  const codes = (input.limitationCodes ?? []).map((c) => c.trim()).filter(Boolean);

  if (!level && codes.length === 0) {
    return null;
  }

  const effectiveLevel: ConfidenceLevel = level ?? (codes.length > 0 ? "low" : "medium");
  const { reasonSummary, knownCodes, unknownCodes } = reasonFromLimitationCodes(codes);

  if (unknownCodes.length > 0 && typeof console !== "undefined") {
    // Internal only — do not surface to UI.
    console.info("[confidence] unknown limitation code(s)", unknownCodes);
  }

  if (effectiveLevel === "high") {
    return {
      label: confidenceUserLabel("high"),
      level: "high",
      reasonSummary: codes.length ? reasonSummary : "当前可用信息基础较完整。",
      recommendedActions: [],
    };
  }

  if (effectiveLevel === "medium") {
    return {
      label: confidenceUserLabel("medium"),
      level: "medium",
      reasonSummary: codes.length ? reasonSummary : "结论可参考，仍建议用首轮内容验证。",
      recommendedActions: codes.length
        ? actionsForCodes([...knownCodes, ...unknownCodes], input.projectId, input.context).slice(0, 2)
        : [
            {
              id: "light-validate",
              label: "用首轮内容验证方向",
              actionType: "info",
            },
          ],
    };
  }

  // LOW — must have reason + actions
  const recommendedActions = actionsForCodes(
    knownCodes.length || unknownCodes.length ? [...knownCodes, ...unknownCodes] : codes,
    input.projectId,
    input.context,
  );

  const framingNote =
    input.context === "strategy"
      ? "这是一版验证型策略。"
      : input.context === "planning"
        ? "本轮为验证型内容计划。"
        : undefined;

  return {
    label: confidenceUserLabel("low"),
    level: "low",
    reasonSummary: codes.length ? reasonSummary : UNKNOWN_LIMITATION_FALLBACK,
    recommendedActions:
      recommendedActions.length > 0
        ? recommendedActions
        : [
            {
              id: "fallback-enrich",
              label: "补充市场素材或先验证首轮内容",
              description: UNKNOWN_LIMITATION_FALLBACK,
              href: `/dashboard/projects/${input.projectId}/market/research`,
              actionType: "navigate",
            },
          ],
    framingNote,
  };
}

/** True if rendered text would leak SCREAMING_SNAKE enums into user UI. */
export function textExposesRawLimitationCode(text: string): boolean {
  return /\b(NO_MARKET_DATA|LIMITED_SAMPLE|MANUAL_ONLY|MISSING_METRICS|MISSING_CONTENT_METRICS|UNKNOWN_SELECTION_METHOD|NO_MARKET_INSIGHT|NO_PERFORMANCE_HISTORY|LIMITED_MARKET_SAMPLE|BRIEF_VERSION_MISMATCH)\b/.test(
    text,
  );
}
