import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(databaseRoot, "..");

export const DEV_DATABASE_URL =
  "postgresql://acf:acf@localhost:5432/acf_dev?schema=public";
export const TEST_DATABASE_URL =
  "postgresql://acf:acf@localhost:5432/acf_test?schema=public";
/** Windows persistent local cluster (db:local:*). Never point tests at acf_dev. */
export const LOCAL_WINDOWS_TEST_DATABASE_URL =
  "postgresql://acf:acf@127.0.0.1:55432/acf_test?schema=public";

type EmbeddedHandle = {
  stop: () => Promise<void>;
};

let embedded: EmbeddedHandle | undefined;
let prisma: PrismaClient | undefined;

function canConnect(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function runPrisma(args: string[], databaseUrl: string): void {
  const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, ...args, "--schema", "prisma/schema.prisma"], {
    cwd: databaseRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

async function tryDockerCompose(): Promise<boolean> {
  try {
    const docker = process.platform === "win32" ? "docker.exe" : "docker";
    execFileSync(docker, ["compose", "up", "-d", "postgres"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    return false;
  }

  for (let i = 0; i < 40; i += 1) {
    if (await canConnect("127.0.0.1", 5432, 500)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function pickEmbeddedPort(start = 55432): Promise<number> {
  for (let port = start; port < start + 20; port += 1) {
    if (!(await canConnect("127.0.0.1", port))) {
      return port;
    }
  }
  throw new Error("No free port for embedded PostgreSQL");
}

async function startEmbeddedPostgres(): Promise<string> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = await pickEmbeddedPort();
  const databaseDir = path.join(os.tmpdir(), `acf-embedded-postgres-${process.pid}-${randomUUID().slice(0, 8)}`);
  try {
    rmSync(databaseDir, { recursive: true, force: true });
  } catch {
    // Windows may lock leftover files from a previous crash; initdb uses a fresh dir name via pid.
  }
  const instance = new EmbeddedPostgres({
    databaseDir,
    user: "acf",
    password: "acf",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
  });

  await instance.initialise();
  await instance.start();
  if (typeof instance.createDatabase === "function") {
    await instance.createDatabase("acf_test");
  }

  embedded = {
    stop: async () => {
      await instance.stop();
    },
  };

  return `postgresql://acf:acf@127.0.0.1:${port}/acf_test?schema=public`;
}

function isPrismaProtocol(url: string): boolean {
  return /^prisma(\+postgres)?:\/\//i.test(url.trim());
}

function parsePostgresUrl(raw: string): URL | undefined {
  if (!raw.trim() || isPrismaProtocol(raw)) {
    return undefined;
  }
  try {
    return new URL(raw.trim().replace(/^postgresql:/i, "http:"));
  } catch {
    return undefined;
  }
}

function postgresUrlForDatabase(source: URL, database: string): string {
  const host = source.hostname === "localhost" ? "127.0.0.1" : source.hostname;
  const port = source.port || "5432";
  const user = decodeURIComponent(source.username);
  const password = decodeURIComponent(source.password);
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : "";
  const search = source.search || "?schema=public";
  return `postgresql://${auth}${host}:${port}/${database}${search}`;
}

function ensureDatabaseExists(adminSource: URL, databaseName: string): void {
  const host = adminSource.hostname === "localhost" ? "127.0.0.1" : adminSource.hostname;
  const port = adminSource.port || "5432";
  const user = decodeURIComponent(adminSource.username) || "acf";
  const password = decodeURIComponent(adminSource.password);
  const env = {
    ...process.env,
    ACF_PG_HOST: host,
    ACF_PG_PORT: String(port),
    ACF_PG_USER: user,
    ACF_PG_PASSWORD: password,
    ACF_ENSURE_DB: databaseName,
  };
  const code = `
    const {Client}=require('pg');
    const db=process.env.ACF_ENSURE_DB;
    if (!/^[a-z_][a-z0-9_]*$/.test(db||'')) process.exit(2);
    const base={host:process.env.ACF_PG_HOST,port:Number(process.env.ACF_PG_PORT),user:process.env.ACF_PG_USER,password:process.env.ACF_PG_PASSWORD};
    async function withMaint(maint){
      const c=new Client({...base,database:maint});
      await c.connect();
      try {
        const found=await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[db]);
        if (!found.rowCount) {
          await c.query('CREATE DATABASE '+db+" OWNER acf ENCODING 'UTF8'");
        }
      } finally { await c.end(); }
    }
    (async()=>{
      for (const maint of ['postgres','acf_dev']) {
        try { await withMaint(maint); process.exit(0); }
        catch (e) { /* try next */ }
      }
      process.exit(1);
    })();
  `;
  try {
    execFileSync(process.execPath, ["-e", code], { cwd: repoRoot, env, stdio: "pipe" });
  } catch {
    throw new Error("Unable to inspect local PostgreSQL databases for test setup");
  }
}

async function resolveReachableTestUrl(candidate: string): Promise<string | undefined> {
  const parsed = parsePostgresUrl(candidate);
  if (!parsed) {
    return undefined;
  }
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
  const port = Number(parsed.port || 5432);
  if (!(await canConnect(host, port))) {
    return undefined;
  }
  const testUrl = postgresUrlForDatabase(parsed, "acf_test");
  const testParsed = parsePostgresUrl(testUrl);
  if (!testParsed) {
    return undefined;
  }
  ensureDatabaseExists(testParsed, "acf_test");
  return testUrl;
}

export async function startTestDatabase(): Promise<string> {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv && !isPrismaProtocol(fromEnv)) {
    const resolved = await resolveReachableTestUrl(fromEnv);
    if (resolved) {
      return resolved;
    }
  }

  if (await canConnect("127.0.0.1", 55432)) {
    const resolved = await resolveReachableTestUrl(LOCAL_WINDOWS_TEST_DATABASE_URL);
    if (resolved) {
      return resolved;
    }
  }

  if (await canConnect("127.0.0.1", 5432)) {
    const resolved = await resolveReachableTestUrl(TEST_DATABASE_URL);
    if (resolved) {
      return resolved;
    }
    return TEST_DATABASE_URL;
  }

  if (await tryDockerCompose()) {
    return TEST_DATABASE_URL;
  }

  return startEmbeddedPostgres();
}

export function generateClient(): void {
  try {
    runPrisma(["generate"], DEV_DATABASE_URL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("EPERM") && message.includes("query_engine")) {
      return;
    }
    throw error;
  }
}

export function migrateDeploy(databaseUrl: string): void {
  runPrisma(["migrate", "deploy"], databaseUrl);
}

export async function rebuildSchemaAsync(databaseUrl: string): Promise<void> {
  const wipe = new PrismaClient({
    datasourceUrl: databaseUrl,
  });
  try {
    await wipe.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await wipe.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await wipe.$disconnect();
  }
  migrateDeploy(databaseUrl);
}

export function getPrisma(databaseUrl: string): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: databaseUrl,
    });
  }
  return prisma;
}

export async function stopTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
  if (embedded) {
    try {
      await embedded.stop();
    } catch {
      // Windows: data directory can stay locked after postgres exits.
    }
    embedded = undefined;
  }
}
