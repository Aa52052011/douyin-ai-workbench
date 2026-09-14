import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function loadDbUrl() {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "DATABASE_URL") continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env.DATABASE_URL = value;
  }
}

loadDbUrl();
const prisma = new PrismaClient({ log: [] });
try {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const recent = await prisma.asset.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      projectId: true,
      type: true,
      status: true,
      originalFilename: true,
      mimeType: true,
      size: true,
      sourceType: true,
      createdAt: true,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      projects: projects.map((row) => ({ id: row.id, name: row.name })),
      recentAssets: recent,
    })}\n`,
  );
} finally {
  await prisma.$disconnect();
}
