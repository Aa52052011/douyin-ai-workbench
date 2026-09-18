/** Next rewrite target for `/api/*`. Same-VPS loopback is expected; not a browser URL. */
export function resolveBackendRewriteUrl(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): string {
  const explicit = env.BACKEND_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  if (env.NODE_ENV !== "production") {
    return "http://localhost:3001";
  }
  const isStart = argv.includes("start") || env.npm_lifecycle_event === "start";
  if (isStart) {
    throw new Error("BACKEND_URL is required in production");
  }
  return "http://127.0.0.1:3001";
}
