import type { ProductBriefPayload } from "./product-brief.types";
import type { Project } from "./types";
import {
  POSITIONING_AGENT_ID,
  POSITIONING_AGENT_VERSION,
  POSITIONING_INPUT_LIMITS,
  type PositioningFormState,
  type PositioningInput,
  type PositioningOutput,
  type PositioningRecord,
} from "./positioning.types";

const INPUT_KEYS = [
  "industry",
  "platform",
  "accountType",
  "goal",
  "targetAudience",
  "expertise",
  "additionalInfo",
] as const;

export type PositioningFieldErrors = Partial<Record<keyof PositioningFormState, string>>;

type RunLike = {
  id: string;
  agentId?: string;
  agentVersion?: string;
  status: string;
  input?: unknown;
  output?: unknown;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const next = value.map((item) => asNonEmptyString(item)).filter((item): item is string => Boolean(item));
  return next.length > 0 ? next : undefined;
}

export function parsePositioningInput(value: unknown): PositioningInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const industry = asNonEmptyString(value.industry);
  const platform = asNonEmptyString(value.platform);
  const accountType = asNonEmptyString(value.accountType);
  const goal = asNonEmptyString(value.goal);
  if (!industry || !platform || !accountType || !goal) {
    return null;
  }
  if (industry.length > POSITIONING_INPUT_LIMITS.industry || platform.length > POSITIONING_INPUT_LIMITS.platform) {
    return null;
  }
  if (accountType.length > POSITIONING_INPUT_LIMITS.accountType || goal.length > POSITIONING_INPUT_LIMITS.goal) {
    return null;
  }
  const parsed: PositioningInput = { industry, platform, accountType, goal };
  const targetAudience = asNonEmptyString(value.targetAudience);
  const expertise = asNonEmptyString(value.expertise);
  const additionalInfo = asNonEmptyString(value.additionalInfo);
  if (targetAudience && targetAudience.length <= POSITIONING_INPUT_LIMITS.targetAudience) {
    parsed.targetAudience = targetAudience;
  }
  if (expertise && expertise.length <= POSITIONING_INPUT_LIMITS.expertise) {
    parsed.expertise = expertise;
  }
  if (additionalInfo && additionalInfo.length <= POSITIONING_INPUT_LIMITS.additionalInfo) {
    parsed.additionalInfo = additionalInfo;
  }
  return parsed;
}

export function parsePositioningOutput(value: unknown): PositioningOutput | null {
  if (!isRecord(value)) {
    return null;
  }
  const accountPositioning = asNonEmptyString(value.accountPositioning);
  const profileBio = asNonEmptyString(value.profileBio);
  const userPainPoints = asStringArray(value.userPainPoints);
  const differentiation = asStringArray(value.differentiation);
  const contentFormats = asStringArray(value.contentFormats);
  const audience = isRecord(value.targetAudience) ? value.targetAudience : null;
  const persona = isRecord(value.persona) ? value.persona : null;
  const publishing = isRecord(value.publishingStrategy) ? value.publishingStrategy : null;
  const audienceDescription = audience ? asNonEmptyString(audience.description) : undefined;
  const identity = persona ? asNonEmptyString(persona.identity) : undefined;
  const tone = persona ? asNonEmptyString(persona.tone) : undefined;
  const characteristics = persona ? asStringArray(persona.characteristics) : undefined;
  const frequency = publishing ? asNonEmptyString(publishing.frequency) : undefined;
  if (
    !accountPositioning ||
    !profileBio ||
    !userPainPoints ||
    !differentiation ||
    !contentFormats ||
    !audienceDescription ||
    !identity ||
    !tone ||
    !characteristics ||
    !frequency
  ) {
    return null;
  }
  const niches = parseNamedList(value.contentNiches, ["name", "reason"]);
  const directions = parseNamedList(value.initialContentDirections, ["title", "description", "reason"]);
  const pillars = parsePillars(value.contentPillars);
  if (!niches || !directions || !pillars) {
    return null;
  }
  return {
    accountPositioning,
    targetAudience: {
      description: audienceDescription,
      demographics: audience ? asNonEmptyString(audience.demographics) : undefined,
      interests: audience ? asStringArray(audience.interests) : undefined,
      painPoints: audience ? asStringArray(audience.painPoints) : undefined,
    },
    userPainPoints,
    contentNiches: niches as Array<{ name: string; reason: string }>,
    contentPillars: pillars,
    differentiation,
    persona: { identity, tone, characteristics },
    profileBio,
    contentFormats,
    publishingStrategy: {
      frequency,
      recommendedLength: publishing ? asNonEmptyString(publishing.recommendedLength) : undefined,
      recommendedStyle: publishing ? asNonEmptyString(publishing.recommendedStyle) : undefined,
    },
    initialContentDirections: directions as Array<{ title: string; description: string; reason: string }>,
  };
}

function parseNamedList(value: unknown, keys: string[]): Array<Record<string, string>> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const rows: Array<Record<string, string>> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const row: Record<string, string> = {};
    for (const key of keys) {
      const text = asNonEmptyString(item[key]);
      if (!text) {
        return null;
      }
      row[key] = text;
    }
    rows.push(row);
  }
  return rows;
}

function parsePillars(value: unknown): Array<{ name: string; description: string; percentage?: number }> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const rows: Array<{ name: string; description: string; percentage?: number }> = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const name = asNonEmptyString(item.name);
    const description = asNonEmptyString(item.description);
    if (!name || !description) {
      return null;
    }
    const percentage = item.percentage;
    if (percentage != null && (typeof percentage !== "number" || !Number.isFinite(percentage))) {
      return null;
    }
    rows.push({
      name,
      description,
      percentage: typeof percentage === "number" ? percentage : undefined,
    });
  }
  return rows;
}

export function isPositioningV1Run(run: RunLike): boolean {
  return run.agentId === POSITIONING_AGENT_ID && run.agentVersion === POSITIONING_AGENT_VERSION;
}

export function sortRunsNewestFirst<T extends { createdAt: string }>(runs: T[]): T[] {
  return [...runs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function completedPositioningRecords(runs: RunLike[]): PositioningRecord[] {
  return sortRunsNewestFirst(runs)
    .filter((run) => isPositioningV1Run(run) && run.status === "COMPLETED")
    .flatMap((run) => {
      const output = parsePositioningOutput(run.output);
      if (!output) {
        return [];
      }
      return [
        {
          runId: run.id,
          createdAt: run.createdAt,
          input: parsePositioningInput(run.input),
          output,
        },
      ];
    });
}

export function currentPositioningRecord(runs: RunLike[]): PositioningRecord | null {
  return completedPositioningRecords(runs)[0] ?? null;
}

export function historyPositioningRecords(runs: RunLike[], current: PositioningRecord | null): PositioningRecord[] {
  const all = completedPositioningRecords(runs);
  if (!current) {
    return all;
  }
  return all.filter((item) => item.runId !== current.runId);
}

export function latestFailedPositioning(runs: RunLike[]): RunLike | null {
  const newest = sortRunsNewestFirst(runs).find((run) => isPositioningV1Run(run));
  return newest && newest.status === "FAILED" ? newest : null;
}

export function emptyPositioningForm(): PositioningFormState {
  return {
    industry: "",
    platform: "",
    accountType: "",
    goal: "",
    targetAudience: "",
    expertise: "",
    additionalInfo: "",
  };
}

export function suggestedPositioningForm(input: {
  lastInput?: PositioningInput | null;
  brief?: ProductBriefPayload | null;
  project?: Pick<Project, "industry" | "platform" | "description"> | null;
}): PositioningFormState {
  const constraints = input.brief?.constraints?.filter(Boolean).join("；") ?? "";
  const suggested: PositioningFormState = {
    industry: input.brief?.industry || input.project?.industry || "",
    platform: input.project?.platform || "",
    accountType: "",
    goal: input.brief?.businessGoal || "",
    targetAudience: input.brief?.targetAudience || "",
    expertise: "",
    additionalInfo: constraints || input.project?.description || "",
  };
  if (!input.lastInput) {
    return suggested;
  }
  return {
    industry: input.lastInput.industry || suggested.industry,
    platform: input.lastInput.platform || suggested.platform,
    accountType: input.lastInput.accountType || suggested.accountType,
    goal: input.lastInput.goal || suggested.goal,
    targetAudience: input.lastInput.targetAudience || suggested.targetAudience,
    expertise: input.lastInput.expertise || suggested.expertise,
    additionalInfo: input.lastInput.additionalInfo || suggested.additionalInfo,
  };
}

export function inputFromForm(form: PositioningFormState): PositioningInput {
  const input: PositioningInput = {
    industry: form.industry.trim(),
    platform: form.platform.trim(),
    accountType: form.accountType.trim(),
    goal: form.goal.trim(),
  };
  if (form.targetAudience.trim()) input.targetAudience = form.targetAudience.trim();
  if (form.expertise.trim()) input.expertise = form.expertise.trim();
  if (form.additionalInfo.trim()) input.additionalInfo = form.additionalInfo.trim();
  return input;
}

export function validatePositioningForm(form: PositioningFormState): PositioningFieldErrors {
  const errors: PositioningFieldErrors = {};
  const required: Array<[keyof PositioningFormState, string]> = [
    ["industry", "行业"],
    ["platform", "平台"],
    ["accountType", "账号类型"],
    ["goal", "定位目标"],
  ];
  for (const [key, label] of required) {
    const value = form[key].trim();
    if (!value) {
      errors[key] = `请填写${label}`;
    } else if (value.length > POSITIONING_INPUT_LIMITS[key]) {
      errors[key] = `${label}不能超过 ${POSITIONING_INPUT_LIMITS[key]} 个字`;
    }
  }
  const optional: Array<["targetAudience" | "expertise" | "additionalInfo", string]> = [
    ["targetAudience", "目标受众"],
    ["expertise", "内容偏好"],
    ["additionalInfo", "补充限制"],
  ];
  for (const [key, label] of optional) {
    if (form[key].trim().length > POSITIONING_INPUT_LIMITS[key]) {
      errors[key] = `${label}不能超过 ${POSITIONING_INPUT_LIMITS[key]} 个字`;
    }
  }
  return errors;
}

export function onlyContractInput(input: PositioningInput): PositioningInput {
  const next: PositioningInput = {
    industry: input.industry,
    platform: input.platform,
    accountType: input.accountType,
    goal: input.goal,
  };
  for (const key of INPUT_KEYS) {
    if (key === "industry" || key === "platform" || key === "accountType" || key === "goal") {
      continue;
    }
    if (input[key]) {
      next[key] = input[key];
    }
  }
  return next;
}

export function marketResearchHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/market/research`;
}

export function contentPlansHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/content/plans`;
}

export function productInformationHref(projectId: string): string {
  return `/dashboard/projects/${projectId}/product`;
}

export function humanizePositioningError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("timeout") || message.includes("Timeout")) {
    return "生成时间较长，请稍后重试。";
  }
  return "账号定位生成失败，请稍后重试。";
}

export function isGeneratingStatus(status: string): boolean {
  return status === "PENDING" || status === "RUNNING" || status === "PROCESSING";
}
