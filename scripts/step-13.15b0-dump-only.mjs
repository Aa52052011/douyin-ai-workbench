/**
 * Dump-only backup of acf_dev. Never restore/drop/truncate.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "package.json"));

function loadDotEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function findTool(name) {
  const toolDirs = [
    path.join(repoRoot, ".local", "pg-client", "pgsql", "bin"),
    path.join(repoRoot, "database", "node_modules", "@embedded-postgres", "windows-x64", "native", "bin"),
  ];
  for (const dir of toolDirs) {
    const exe = path.join(dir, process.platform === "win32" ? `${name}.exe` : name);
    if (fs.existsSync(exe)) return exe;
  }
  const which = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0];
  return null;
}

function parseDatabaseUrl(raw) {
  const u = new URL(raw.replace(/^postgresql:/, "http:"));
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: (u.pathname || "").replace(/^\//, "").split("?")[0],
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

loadDotEnv();
const outDir = path.join(repoRoot, ".local", "dogfood", "30-day", "preflight");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dumpFile = path.join(outDir, `acf_dev-${stamp}.dump`);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write("DATABASE_URL missing\n");
  process.exit(2);
}
const cfg = parseDatabaseUrl(databaseUrl);
if (cfg.database !== "acf_dev") {
  process.stderr.write("refusing dump: database is not acf_dev\n");
  process.exit(3);
}
const pgDump = findTool("pg_dump");
if (!pgDump) {
  process.stderr.write("pg_dump not found\n");
  process.exit(4);
}
const dump = spawnSync(
  pgDump,
  ["-h", cfg.host, "-p", String(cfg.port), "-U", cfg.user, "-d", cfg.database, "--format=custom", `--file=${dumpFile}`],
  { env: { ...process.env, PGPASSWORD: cfg.password }, encoding: "utf8", windowsHide: true },
);
if (dump.status !== 0 || !fs.existsSync(dumpFile)) {
  process.stderr.write("pg_dump failed\n");
  process.exit(5);
}
const size = fs.statSync(dumpFile).size;
if (size <= 0) {
  process.stderr.write("empty dump\n");
  process.exit(6);
}
const pgRestore = findTool("pg_restore");
let tocEntries = null;
if (pgRestore) {
  const list = spawnSync(pgRestore, ["--list", dumpFile], {
    env: { ...process.env, PGPASSWORD: cfg.password },
    encoding: "utf8",
    windowsHide: true,
  });
  tocEntries = list.status === 0 ? list.stdout.split(/\r?\n/).filter((l) => l && !l.startsWith(";")).length : null;
}
process.stdout.write(
  `${JSON.stringify({
    backupCreated: true,
    fileExists: true,
    size,
    timestamp: new Date().toISOString(),
    database: cfg.database,
    host: cfg.host,
    port: cfg.port,
    format: "custom",
    restoreNotRun: true,
    tocEntries,
    relativeFile: path.relative(repoRoot, dumpFile).replaceAll("\\", "/"),
  })}\n`,
);
void require;
