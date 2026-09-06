import type { AuthSession } from "./api";

export type PublicAuthSession = Omit<AuthSession, "accessToken" | "expiresIn">;

export type AuthSnapshot = {
  accessToken: string | null;
  session: PublicAuthSession | null;
  ready: boolean;
  error: string | null;
};

export const AUTH_BOUNDARY_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/logout-all",
] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";
const SESSION_EXPIRED_MESSAGE = "登录状态已过期，请重新登录。";

const SERVER_SNAPSHOT: AuthSnapshot = {
  accessToken: null,
  session: null,
  ready: false,
  error: null,
};

let snapshot: AuthSnapshot = { ...SERVER_SNAPSHOT };
const listeners = new Set<() => void>();
let sessionGeneration = 0;
let refreshPromise: Promise<boolean> | null = null;
let unauthorizedHandler: (() => void) | null = null;
let unauthorizedNotified = false;

export function isAuthBoundaryPath(path: string): boolean {
  const pathname = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return AUTH_BOUNDARY_PATHS.some((boundary) => pathname === boundary || pathname.endsWith(boundary));
}

export function getAccessToken(): string | null {
  return snapshot.accessToken;
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function getServerAuthSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function replaceSnapshot(next: AuthSnapshot): void {
  if (
    next.accessToken === snapshot.accessToken &&
    next.session === snapshot.session &&
    next.ready === snapshot.ready &&
    next.error === snapshot.error
  ) {
    return;
  }
  snapshot = next;
  emit();
}

function toPublicSession(data: AuthSession): PublicAuthSession {
  return {
    user: data.user,
    tenant: data.tenant,
    workspace: data.workspace,
    role: data.role,
  };
}

function notifyUnauthorized(): void {
  if (unauthorizedNotified) {
    return;
  }
  unauthorizedNotified = true;
  unauthorizedHandler?.();
}

function clearSessionState(error: string | null): void {
  replaceSnapshot({
    accessToken: null,
    session: null,
    ready: true,
    error,
  });
}

export function applyAuthSession(data: AuthSession, startedGeneration?: number): boolean {
  if (startedGeneration !== undefined && startedGeneration !== sessionGeneration) {
    return false;
  }
  unauthorizedNotified = false;
  replaceSnapshot({
    accessToken: data.accessToken ?? null,
    session: toPublicSession(data),
    ready: true,
    error: null,
  });
  return true;
}

async function runRefresh(startedGeneration: number): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
    const data = (await response.json().catch(() => ({}))) as AuthSession & {
      code?: string;
      message?: string;
    };
    if (!response.ok || !data.accessToken) {
      if (startedGeneration === sessionGeneration) {
        clearSessionState(SESSION_EXPIRED_MESSAGE);
        notifyUnauthorized();
      }
      return false;
    }
    return applyAuthSession(data, startedGeneration);
  } catch {
    if (startedGeneration === sessionGeneration) {
      clearSessionState(SESSION_EXPIRED_MESSAGE);
      notifyUnauthorized();
    }
    return false;
  }
}

export function refreshSessionSingleflight(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }
  const startedGeneration = sessionGeneration;
  refreshPromise = runRefresh(startedGeneration).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function hydrateAuthSession(): Promise<void> {
  await refreshSessionSingleflight();
  if (!snapshot.ready) {
    replaceSnapshot({ ...snapshot, ready: true });
  }
}

export async function logoutSession(): Promise<void> {
  sessionGeneration += 1;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
  } catch {
    // Logout must always clear the local session.
  } finally {
    unauthorizedNotified = false;
    clearSessionState(null);
  }
}

export function resetAuthSessionForTests(): void {
  sessionGeneration += 1;
  refreshPromise = null;
  unauthorizedHandler = null;
  unauthorizedNotified = false;
  snapshot = { ...SERVER_SNAPSHOT };
  listeners.clear();
}

export function seedAuthSessionForTests(data: AuthSession): void {
  applyAuthSession(data);
}

export function getSessionGenerationForTests(): number {
  return sessionGeneration;
}

export function isRefreshInFlightForTests(): boolean {
  return refreshPromise !== null;
}
