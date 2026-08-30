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
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export async function api<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw Object.assign(new Error(data.message || "Request failed"), {
      code: data.code ?? "REQUEST_FAILED",
    });
  }
  return data;
}
