import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, apiUpload, type AuthSession } from "./api";
import {
  applyAuthSession,
  getAccessToken,
  getAuthSnapshot,
  hydrateAuthSession,
  isAuthBoundaryPath,
  logoutSession,
  refreshSessionSingleflight,
  resetAuthSessionForTests,
  seedAuthSessionForTests,
  setUnauthorizedHandler,
  subscribeAuthSession,
} from "./auth-session";

const here = dirname(fileURLToPath(import.meta.url));

const sampleSession = (accessToken: string): AuthSession => ({
  user: { id: "u1", email: "a@b.com", name: "Ada", createdAt: "2026-01-01T00:00:00.000Z" },
  tenant: { id: "t1", name: "Acme", slug: "acme" },
  workspace: { id: "w1", name: "Main", slug: "main" },
  role: "owner",
  accessToken,
  expiresIn: 900,
});

type MockCall = {
  url: string;
  method: string;
  credentials: RequestCredentials | undefined;
  authorization: string | null;
  body: string | null;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(handler: (call: MockCall) => Promise<Response> | Response): MockCall[] {
  const calls: MockCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const call: MockCall = {
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      credentials: init?.credentials,
      authorization: headers.get("Authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function source(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

async function expectRejects(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  throw new Error("expected request to fail");
}

async function run() {
  const originalFetch = globalThis.fetch;
  const authSource = source("auth-session.ts");
  const apiSource = source("api.ts");
  const contextSource = source("auth-context.tsx");

  try {
    resetAuthSessionForTests();

    assert.equal(authSource.includes("localStorage"), false);
    assert.equal(apiSource.includes("localStorage"), false);
    assert.equal(contextSource.includes("localStorage"), false);
    assert.equal(authSource.includes("sessionStorage"), false);
    assert.equal(apiSource.includes("sessionStorage"), false);
    assert.equal(contextSource.includes("sessionStorage"), false);
    assert.equal(authSource.includes("acf_rt"), false);
    assert.equal(apiSource.includes("acf_rt"), false);
    assert.equal(authSource.includes("refreshRaw"), false);
    assert.equal(authSource.includes("document.cookie"), false);
    assert.match(authSource, /credentials:\s*"include"/);
    assert.match(apiSource, /credentials:\s*"include"/);
    for (const text of [authSource, apiSource, contextSource]) {
      assert.equal(text.includes("// eslint-disable"), false);
      assert.equal(text.includes("/* eslint-disable"), false);
    }
    assert.equal(contextSource.includes("useSyncExternalStore"), true);
    assert.equal(contextSource.includes("setAccessToken("), false);
    assert.equal(contextSource.includes("setSession("), false);
    assert.equal(contextSource.includes("setReady("), false);
    assert.equal(isAuthBoundaryPath("/auth/login"), true);
    assert.equal(isAuthBoundaryPath("/auth/refresh"), true);
    assert.equal(isAuthBoundaryPath("/auth/logout"), true);
    assert.equal(isAuthBoundaryPath("/projects"), false);

    seedAuthSessionForTests(sampleSession("memory-only"));
    assert.equal(getAccessToken(), "memory-only");
    assert.equal(getAuthSnapshot().session?.user.email, "a@b.com");

    {
      resetAuthSessionForTests();
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/login")) {
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "bad password" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const error = await expectRejects(() =>
        api("/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.com", password: "x" }) }),
      );
      assert.match(error.message, /bad password/);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 0);
      assert.equal(calls.length, 1);
    }

    {
      resetAuthSessionForTests();
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "refresh revoked" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const ok = await refreshSessionSingleflight();
      assert.equal(ok, false);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
      assert.equal(getAccessToken(), null);
      assert.equal(getAuthSnapshot().ready, true);
    }

    {
      resetAuthSessionForTests();
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/logout")) {
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "already gone" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      seedAuthSessionForTests(sampleSession("old"));
      await logoutSession();
      assert.equal(getAccessToken(), null);
      assert.equal(getAuthSnapshot().session, null);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 0);
      assert.equal(calls[0]?.credentials, "include");
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      const seenAuth: string[] = [];
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          assert.equal(call.credentials, "include");
          await delay(20);
          return jsonResponse(200, sampleSession("fresh"));
        }
        if (call.url.endsWith("/projects")) {
          seenAuth.push(call.authorization ?? "");
          if (call.authorization === "Bearer fresh") {
            return jsonResponse(200, [{ id: "p1" }]);
          }
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const rows = await api<{ id: string }[]>("/projects", { accessToken: "expired" });
      assert.equal(rows[0]?.id, "p1");
      assert.equal(getAccessToken(), "fresh");
      assert.deepEqual(seenAuth, ["Bearer expired", "Bearer fresh"]);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
      assert.equal(calls.filter((call) => call.url.endsWith("/projects")).length, 2);
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          await delay(20);
          return jsonResponse(200, sampleSession("fresh"));
        }
        if (call.url.endsWith("/agents/runs")) {
          if (call.authorization === "Bearer fresh") {
            return jsonResponse(200, { id: "run-1" });
          }
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const created = await api<{ id: string }>("/agents/runs", {
        method: "POST",
        body: "{}",
        accessToken: "expired",
      });
      assert.equal(created.id, "run-1");
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
      assert.equal(calls.filter((call) => call.url.endsWith("/agents/runs")).length, 2);
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      let refreshCalls = 0;
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          await delay(25);
          return jsonResponse(200, sampleSession("fresh"));
        }
        if (call.url.includes("/items/")) {
          if (call.authorization === "Bearer fresh") {
            return jsonResponse(200, { ok: true, url: call.url });
          }
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const [a, b, c] = await Promise.all([
        api("/items/a", { accessToken: "expired" }),
        api("/items/b", { accessToken: "expired" }),
        api("/items/c", { accessToken: "expired" }),
      ]);
      assert.equal((a as { ok: boolean }).ok, true);
      assert.equal((b as { ok: boolean }).ok, true);
      assert.equal((c as { ok: boolean }).ok, true);
      assert.equal(refreshCalls, 1);
      assert.equal(calls.filter((call) => call.url.includes("/items/")).length, 6);
      assert.equal(getAccessToken(), "fresh");
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      let handlerCalls = 0;
      setUnauthorizedHandler(() => {
        handlerCalls += 1;
      });
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          await delay(20);
          return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "refresh revoked" });
        }
        return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
      });
      const results = await Promise.allSettled([
        api("/projects", { accessToken: "expired" }),
        api("/videos", { accessToken: "expired" }),
        api("/scripts", { accessToken: "expired" }),
      ]);
      assert.equal(results.every((result) => result.status === "rejected"), true);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
      assert.equal(calls.filter((call) => !call.url.endsWith("/auth/refresh")).length, 3);
      assert.equal(getAccessToken(), null);
      assert.equal(handlerCalls, 1);
      assert.equal(getAuthSnapshot().error, "登录状态已过期，请重新登录。");
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          return jsonResponse(200, sampleSession("fresh"));
        }
        return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "still unauthorized" });
      });
      const error = await expectRejects(() => api("/projects", { accessToken: "expired" }));
      assert.match(error.message, /still unauthorized/);
      assert.equal((error as Error & { status?: number }).status, 401);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
      assert.equal(calls.filter((call) => call.url.endsWith("/projects")).length, 2);
      assert.equal(getAccessToken(), "fresh");
    }

    {
      resetAuthSessionForTests();
      const calls = installFetch(async () => jsonResponse(200, sampleSession("from-cookie")));
      assert.equal(getAccessToken(), null);
      const hydrated = await hydrateAuthSession();
      void hydrated;
      const recovered = await api("/projects");
      void recovered;
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
    }

    {
      resetAuthSessionForTests();
      let refreshCalls = 0;
      installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          await delay(25);
          return jsonResponse(200, sampleSession("shared"));
        }
        if (call.authorization === "Bearer shared") {
          return jsonResponse(200, { ok: true });
        }
        return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
      });
      const [hydrated, recovered] = await Promise.all([hydrateAuthSession(), api("/projects")]);
      void hydrated;
      assert.equal((recovered as { ok: boolean }).ok, true);
      assert.equal(refreshCalls, 1);
      assert.equal(getAccessToken(), "shared");
    }

    {
      resetAuthSessionForTests();
      let notified = 0;
      const unsubscribe = subscribeAuthSession(() => {
        notified += 1;
      });
      installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          await delay(20);
          return jsonResponse(200, sampleSession("late"));
        }
        throw new Error(`unexpected ${call.method} ${call.url}`);
      });
      const pending = hydrateAuthSession();
      unsubscribe();
      await pending;
      assert.equal(notified, 0);
      assert.equal(getAccessToken(), "late");
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      let resolveRefresh: ((value: Response) => void) | undefined;
      const refreshGate = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
      installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          return refreshGate;
        }
        if (call.url.endsWith("/auth/logout")) {
          return jsonResponse(200, { ok: true });
        }
        return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
      });
      const recovery = api("/projects", { accessToken: "expired" });
      await delay(5);
      const logout = logoutSession();
      resolveRefresh?.(jsonResponse(200, sampleSession("should-not-apply")));
      await Promise.allSettled([recovery, logout]);
      assert.equal(getAccessToken(), null);
      assert.equal(getAuthSnapshot().session, null);
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("valid"));
      for (const status of [400, 403, 404, 429, 500]) {
        const calls = installFetch(async () =>
          jsonResponse(status, { code: "ERR", message: `status ${status}` }),
        );
        const error = await expectRejects(() => api("/projects", { accessToken: "valid" }));
        assert.match(error.message, new RegExp(`status ${status}`));
        assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 0);
      }
    }

    {
      resetAuthSessionForTests();
      seedAuthSessionForTests(sampleSession("expired"));
      const calls = installFetch(async (call) => {
        if (call.url.endsWith("/auth/refresh")) {
          return jsonResponse(200, sampleSession("fresh"));
        }
        if (call.authorization === "Bearer fresh") {
          return jsonResponse(200, { uploaded: true });
        }
        return jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "expired" });
      });
      const file = new File(["clip"], "clip.mp4", { type: "video/mp4" });
      const uploaded = await apiUpload<{ uploaded: boolean }>("/assets/a1/content", file, "expired");
      assert.equal(uploaded.uploaded, true);
      assert.equal(calls.filter((call) => call.url.endsWith("/auth/refresh")).length, 1);
    }

    {
      resetAuthSessionForTests();
      const applied = applyAuthSession(sampleSession("login-token"));
      assert.equal(applied, true);
      assert.equal(getAccessToken(), "login-token");
    }

    console.log("auth-session selfcheck PASS");
  } finally {
    globalThis.fetch = originalFetch;
    resetAuthSessionForTests();
  }
}

void run();
