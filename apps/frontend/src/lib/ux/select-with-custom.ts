export const CUSTOM_SELECT_VALUE = "__acf_custom__";

export type SelectOptionV1 = {
  value: string;
  label: string;
  recommended?: boolean;
};

export type SelectWithCustomStateV1 = {
  selected: string;
  customText: string;
};

export function createSelectWithCustomState(
  options: SelectOptionV1[],
  initial?: string,
  recommended?: string,
): SelectWithCustomStateV1 {
  if (initial && options.some((item) => item.value === initial)) {
    return { selected: initial, customText: "" };
  }
  if (initial) {
    return { selected: CUSTOM_SELECT_VALUE, customText: initial };
  }
  if (recommended && options.some((item) => item.value === recommended)) {
    return { selected: recommended, customText: "" };
  }
  return { selected: options[0]?.value ?? CUSTOM_SELECT_VALUE, customText: "" };
}

export function applySelectChange(
  state: SelectWithCustomStateV1,
  nextSelected: string,
): SelectWithCustomStateV1 {
  return { ...state, selected: nextSelected };
}

export function applyCustomText(state: SelectWithCustomStateV1, customText: string): SelectWithCustomStateV1 {
  return { selected: CUSTOM_SELECT_VALUE, customText };
}

/** Switching away from custom must keep customText for when the user returns. */
export function resolvedSelectValue(state: SelectWithCustomStateV1): string {
  if (state.selected === CUSTOM_SELECT_VALUE) return state.customText;
  return state.selected;
}

export function isCustomSelected(state: SelectWithCustomStateV1): boolean {
  return state.selected === CUSTOM_SELECT_VALUE;
}
