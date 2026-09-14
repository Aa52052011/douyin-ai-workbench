/**
 * Runtime + selector presence. Never prints secret values.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const envPath = path.join(repoRoot, ".env");
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function tcp(host, port, ms = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, ms);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function httpOk(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where.exe" : "which", [cmd], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  return r.status === 0 && Boolean(r.stdout.trim());
}

function cred(env, key) {
  const value = env[key]?.trim() ?? "";
  return { present: value.length > 0 ? "YES" : "NO", empty: value.length === 0 ? "YES" : "NO" };
}

const envFile = loadDotEnv();
const ffmpeg = which("ffmpeg");
const ffprobe = which("ffprobe");
const storageRoot = path.join(repoRoot, "apps", "backend", "storage");
const [pg, redis, fe, be] = await Promise.all([
  tcp("127.0.0.1", 55432),
  tcp("127.0.0.1", 6379),
  httpOk("http://127.0.0.1:3010"),
  httpOk("http://127.0.0.1:3001/health"),
]);

const report = {
  runtime: {
    frontend3010: fe.ok ? "PASS" : "FAIL",
    frontendStatus: fe.status,
    backend3001: be.ok ? "PASS" : "FAIL",
    backendStatus: be.status,
    postgres55432: pg ? "PASS" : "FAIL",
    redis6379: redis ? "PASS" : "FAIL",
    ffmpeg: ffmpeg ? "PASS" : "FAIL",
    ffprobe: ffprobe ? "PASS" : "FAIL",
    storageDirExists: fs.existsSync(storageRoot) ? "PASS" : "FAIL",
  },
  envFileSelectors: {
    MODEL_PROVIDER: envFile.MODEL_PROVIDER ?? null,
    MODEL_NAME: envFile.MODEL_NAME ?? null,
    MEDIA_TTS_PROVIDER: envFile.MEDIA_TTS_PROVIDER ?? null,
    MEDIA_IMAGE_PROVIDER: envFile.MEDIA_IMAGE_PROVIDER ?? null,
    MEDIA_COMPOSE_PROVIDER: envFile.MEDIA_COMPOSE_PROVIDER ?? null,
  },
  credentials: {
    MODEL_API_KEY: cred(envFile, "MODEL_API_KEY"),
    MODEL_BASE_URL: cred(envFile, "MODEL_BASE_URL"),
    MODEL_NAME: cred(envFile, "MODEL_NAME"),
    MINIMAX_TTS_API_KEY: cred(envFile, "MINIMAX_TTS_API_KEY"),
    MINIMAX_TTS_BASE_URL: cred(envFile, "MINIMAX_TTS_BASE_URL"),
    MINIMAX_TTS_VOICE: cred(envFile, "MINIMAX_TTS_VOICE"),
    WANX_API_KEY: cred(envFile, "WANX_API_KEY"),
    WANX_BASE_URL: cred(envFile, "WANX_BASE_URL"),
  },
  liveApiNote: "Running Nest process uses process-env overlay MODEL_PROVIDER=mock (not a .env write).",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
