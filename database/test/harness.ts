import { execFileSync } from "node:child_process";
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

async function startEmbeddedPostgres(): Promise<string> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = 55432;
  const databaseDir = path.join(os.tmpdir(), `acf-embedded-postgres-${process.pid}`);
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

export async function startTestDatabase(): Promise<string> {
  if (process.env.DATABASE_URL && (await canConnect("127.0.0.1", 5432))) {
    return process.env.DATABASE_URL;
  }

  if (await canConnect("127.0.0.1", 5432)) {
    return TEST_DATABASE_URL;
  }

  if (await tryDockerCompose()) {
    return TEST_DATABASE_URL;
  }

  return startEmbeddedPostgres();
}

export function generateClient(): void {
  runPrisma(["generate"], DEV_DATABASE_URL);
}

export function migrateDeploy(databaseUrl: string): void {
  runPrisma(["migrate", "deploy"], databaseUrl);
}

export async function rebuildSchemaAsync(databaseUrl: string): Promise<void> {
  const wipe = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
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
      datasources: { db: { url: databaseUrl } },
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
