const KEY = "acf.lastProjectId";

export function readLastProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastProjectId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
