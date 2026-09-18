import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");

const host = process.env.FRONTEND_HOST?.trim() || "127.0.0.1";
const port = process.env.FRONTEND_PORT?.trim() || "3010";

if (process.env.NODE_ENV === "production" && !process.env.BACKEND_URL?.trim()) {
  console.error("BACKEND_URL is required in production");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  cwd: frontendRoot,
  stdio: "inherit",
  env: process.env,
});

let stopping = false;
const stop = () => {
  if (stopping) {
    return;
  }
  stopping = true;
  child.kill("SIGTERM");
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

child.on("exit", (code, signal) => {
  if (stopping) {
    process.exit(code ?? 0);
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
