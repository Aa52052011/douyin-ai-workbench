/**
 * Reports MODEL_BASE_URL host/path only. Never prints secrets or full URL with credentials.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repoRoot, ".env");
const map = {};
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "MODEL_BASE_URL" || key === "MODEL_NAME" || key === "MODEL_PROVIDER") map[key] = value;
  }
}

const raw = map.MODEL_BASE_URL || "";
let host = null;
let pathname = null;
try {
  const u = new URL(raw);
  host = u.host;
  pathname = u.pathname || "/";
} catch {
  host = "INVALID";
  pathname = "INVALID";
}

process.stdout.write(
  `${JSON.stringify({
    host,
    path: pathname,
    containsV1: typeof pathname === "string" && pathname.split("/").includes("v1"),
    modelName: map.MODEL_NAME || null,
    modelProvider: map.MODEL_PROVIDER || null,
  })}\n`,
);
