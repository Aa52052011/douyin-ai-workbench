import { getAccessToken, isAuthBoundaryPath, refreshSessionSingleflight } from "./auth-session";

export type AuthSession = {
  user: { id: string; email: string; name: string; createdAt: string };
  tenant: { id: string; name: string; slug: string };
  workspace: { id: string; name: string; slug: string };
  role: string;
  accessToken?: string;
  expiresIn?: number;
};

export type ApiError = {
  code: string;
  message: string;
  status?: number;
};

export type ApiRequestOptions = RequestInit & {
  accessToken?: string;
  skipAuthRecovery?: boolean;
};

export function isNotFoundError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? String((error as ApiError).code) : "";
  return code.endsWith("_NOT_FOUND") || code === "NOT_FOUND";
}

export async function apiMaybe<T>(path: string, options: ApiRequestOptions = {}): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

function resolveAccessToken(explicit?: string): string | undefined {
  return getAccessToken() ?? explicit ?? undefined;
}

function toApiError(data: Partial<ApiError>, fallback: string, status: number): Error & ApiError {
  return Object.assign(new Error(data.message || fallback), {
    code: data.code ?? "REQUEST_FAILED",
    message: data.message || fallback,
    status,
  });
}

function shouldRecoverUnauthorized(path: string, options: ApiRequestOptions, allowRecovery: boolean): boolean {
  return allowRecovery && !options.skipAuthRecovery && !isAuthBoundaryPath(path);
}

async function parseJson<T>(response: Response): Promise<T & ApiError> {
  return (await response.json().catch(() => ({}))) as T & ApiError;
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(path, options, true);
}

async function requestJson<T>(path: string, options: ApiRequestOptions, allowRecovery: boolean): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const accessToken = resolveAccessToken(options.accessToken);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && shouldRecoverUnauthorized(path, options, allowRecovery)) {
    const refreshed = await refreshSessionSingleflight();
    if (refreshed) {
      return requestJson<T>(path, options, false);
    }
  }

  const data = await parseJson<T>(response);
  if (!response.ok) {
    throw toApiError(data, "Request failed", response.status);
  }
  return data;
}

export async function apiUpload<T>(path: string, file: File, accessToken: string): Promise<T> {
  return requestUpload<T>(path, file, accessToken, true);
}

async function requestUpload<T>(
  path: string,
  file: File,
  accessToken: string,
  allowRecovery: boolean,
): Promise<T> {
  const headers = new Headers();
  const token = resolveAccessToken(accessToken);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 401 && shouldRecoverUnauthorized(path, {}, allowRecovery)) {
    const refreshed = await refreshSessionSingleflight();
    if (refreshed) {
      return requestUpload<T>(path, file, accessToken, false);
    }
  }

  const data = await parseJson<T>(response);
  if (!response.ok) {
    throw toApiError(data, "Upload failed", response.status);
  }
  return data;
}
