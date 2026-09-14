export const FIELD_SOURCES = [
  "USER_ENTERED",
  "USER_OVERRIDDEN",
  "REUSED_FROM_CONTEXT",
  "AI_PREFILLED",
  "AI_SUGGESTED",
  "DEFAULT",
] as const;

export type FieldSourceV1 = (typeof FIELD_SOURCES)[number];

export type FieldControllerStateV1<T> = {
  value: T;
  source: FieldSourceV1;
  editable: true;
  pendingSuggestion?: T;
};

export function defaultEditable(): true {
  return true;
}

export function createFieldState<T>(value: T, source: FieldSourceV1 = "DEFAULT"): FieldControllerStateV1<T> {
  return { value, source, editable: true };
}

export function applyUserEdit<T>(state: FieldControllerStateV1<T>, next: T): FieldControllerStateV1<T> {
  return {
    ...state,
    value: next,
    source: state.source === "USER_ENTERED" ? "USER_ENTERED" : "USER_OVERRIDDEN",
    editable: true,
  };
}

/** Never silently replace a user override. New AI values become pending suggestions. */
export function receiveExternalValue<T>(
  state: FieldControllerStateV1<T>,
  next: T,
  nextSource: FieldSourceV1,
): FieldControllerStateV1<T> {
  if (state.source === "USER_OVERRIDDEN" || state.source === "USER_ENTERED") {
    if (Object.is(state.value, next)) return state;
    return { ...state, pendingSuggestion: next, editable: true };
  }
  return { value: next, source: nextSource, editable: true };
}

export function acceptPendingSuggestion<T>(state: FieldControllerStateV1<T>): FieldControllerStateV1<T> {
  if (state.pendingSuggestion === undefined) return state;
  return { value: state.pendingSuggestion, source: "AI_SUGGESTED", editable: true };
}

export function ignorePendingSuggestion<T>(state: FieldControllerStateV1<T>): FieldControllerStateV1<T> {
  return { ...state, pendingSuggestion: undefined };
}

export function sourceHint(source: FieldSourceV1): string | null {
  switch (source) {
    case "REUSED_FROM_CONTEXT":
      return "已根据账号定位填写";
    case "AI_PREFILLED":
      return "已根据你前面提供的信息填写";
    case "AI_SUGGESTED":
      return "推荐";
    case "USER_OVERRIDDEN":
    case "USER_ENTERED":
      return "这是你填写的内容，可继续修改";
    default:
      return null;
  }
}

export function sanitizeReuseContext(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = [
    "systemPrompt",
    "agent",
    "snapshot",
    "model",
    "provider",
    "sourceAgentRunId",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "password",
    "platformSecret",
  ];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blocked.includes(key)) continue;
    out[key] = value;
  }
  return out;
}
