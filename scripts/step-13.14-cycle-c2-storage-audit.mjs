/**
 * Cycle C2: report MEDIA_STORAGE_ROOT shape only (no secrets, no absolute path).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvKey(file, name) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (k !== name) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

const envFile = path.join(root, ".env");
const configured = readEnvKey(envFile, "MEDIA_STORAGE_ROOT");
const currentProcess = process.env.MEDIA_STORAGE_ROOT ?? null;
const candidates = [configured, currentProcess, path.join(root, "storage"), path.join(root, "apps/backend/storage")].filter(
  Boolean,
);

function describeRoot(label, value) {
  if (!value) {
    return { label, present: false };
  }
  const resolved = path.resolve(root, value);
  return {
    label,
    present: true,
    basename: path.basename(resolved),
    isTemp: /temp|tmp|acf-media/i.test(resolved),
    underRepo: resolved.toLowerCase().startsWith(root.toLowerCase()),
    exists: existsSync(resolved),
  };
}

console.log(
  JSON.stringify(
    {
      envFilePresent: existsSync(envFile),
      fromDotenv: describeRoot("dotenv", configured),
      fromProcess: describeRoot("process", currentProcess),
      repoStorage: describeRoot("repo-storage", path.join(root, "storage")),
      backendStorage: describeRoot("backend-storage", path.join(root, "apps/backend/storage")),
    },
    null,
    2,
  ),
);
