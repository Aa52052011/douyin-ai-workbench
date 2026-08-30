import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateClient,
  getPrisma,
  migrateDeploy,
  rebuildSchemaAsync,
  startTestDatabase,
  stopTestDatabase,
} from "./harness.js";

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function seedTenantGraph(prisma: PrismaClient) {
  const tag = suffix();
  const user = await prisma.user.create({
    data: {
      email: `user-${tag}@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Test User",
    },
  });
  const tenant = await prisma.tenant.create({
    data: {
      name: `Tenant ${tag}`,
      slug: `tenant-${tag}`,
    },
  });
  const membership = await prisma.membership.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      role: "OWNER",
    },
  });
  const workspace = await prisma.workspace.create({
    data: {
      tenantId: tenant.id,
      name: "Default",
      slug: "default",
    },
  });
  const project = await prisma.project.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      name: "Project A",
      industry: "education",
      platform: "douyin",
      description: "schema test",
    },
  });

  return { user, tenant, membership, workspace, project, tag };
}

describe("database schema", () => {
  let databaseUrl: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    generateClient();
    databaseUrl = await startTestDatabase();
    migrateDeploy(databaseUrl);
    prisma = getPrisma(databaseUrl);
    await prisma.$connect();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("generates the Prisma client from schema", () => {
    expect(typeof prisma.user.create).toBe("function");
    expect(typeof prisma.tenant.create).toBe("function");
    expect(typeof prisma.membership.create).toBe("function");
    expect(typeof prisma.workspace.create).toBe("function");
    expect(typeof prisma.project.create).toBe("function");
    expect(typeof prisma.contentPlan.create).toBe("function");
    expect(typeof prisma.script.create).toBe("function");
    expect(typeof prisma.video.create).toBe("function");
    expect(typeof prisma.analytics.create).toBe("function");
    expect(typeof prisma.refreshToken.create).toBe("function");
  });

  it("applies init_core_schema migration", async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    const names = tables.map((row) => row.tablename);
    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "tenants",
        "memberships",
        "workspaces",
        "projects",
        "content_plans",
        "scripts",
        "videos",
        "analytics",
        "refresh_tokens",
        "_prisma_migrations",
      ]),
    );
  });

  it("can drop the schema and replay migrations", async () => {
    await prisma.$disconnect();
    await rebuildSchemaAsync(databaseUrl);
    await prisma.$connect();
    const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM _prisma_migrations
      WHERE migration_name LIKE '%init_core_schema%'
    `;
    expect(Number(count[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("enforces unique user email", async () => {
    const email = `dup-${suffix()}@example.com`;
    await prisma.user.create({
      data: { email, passwordHash: "x", name: "A" },
    });
    await expect(
      prisma.user.create({
        data: { email, passwordHash: "y", name: "B" },
      }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Pick<Prisma.PrismaClientKnownRequestError, "code">);
  });

  it("enforces unique tenant slug", async () => {
    const slug = `slug-${suffix()}`;
    await prisma.tenant.create({
      data: { name: "T1", slug },
    });
    await expect(
      prisma.tenant.create({
        data: { name: "T2", slug },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces unique membership (userId, tenantId)", async () => {
    const { user, tenant } = await seedTenantGraph(prisma);
    await expect(
      prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: "ADMIN" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("requires project to belong to both tenant and workspace", async () => {
    const a = await seedTenantGraph(prisma);
    const b = await seedTenantGraph(prisma);

    expect(a.project.tenantId).toBe(a.tenant.id);
    expect(a.project.workspaceId).toBe(a.workspace.id);

    await expect(
      prisma.project.create({
        data: {
          tenantId: b.tenant.id,
          workspaceId: a.workspace.id,
          name: "cross-tenant",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("associates content plans with tenant, workspace and project", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const plan = await prisma.contentPlan.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        title: "Week 1",
        description: "first plan",
        status: "DRAFT",
      },
    });

    expect(plan.tenantId).toBe(tenant.id);
    expect(plan.workspaceId).toBe(workspace.id);
    expect(plan.projectId).toBe(project.id);
    expect(plan.status).toBe("DRAFT");
  });

  it("allows a video to reference a script", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const plan = await prisma.contentPlan.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        title: "Plan",
        status: "READY",
      },
    });
    const script = await prisma.script.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        contentPlanId: plan.id,
        title: "Script v1",
        content: "hook + body",
        version: 1,
        status: "READY",
      },
    });
    const video = await prisma.video.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        scriptId: script.id,
        filePath: "s3://acf/videos/demo.mp4",
        duration: 15,
        width: 1080,
        height: 1920,
        status: "COMPLETED",
      },
    });

    expect(video.scriptId).toBe(script.id);

    const orphan = await prisma.video.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        status: "PENDING",
      },
    });
    expect(orphan.scriptId).toBeNull();
  });

  it("allows multiple analytics snapshots for one video", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const video = await prisma.video.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        status: "COMPLETED",
        filePath: "local/demo.mp4",
      },
    });

    const first = await prisma.analytics.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        videoId: video.id,
        views: 10,
        likes: 1,
        recordedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    const second = await prisma.analytics.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        videoId: video.id,
        views: 30,
        likes: 4,
        comments: 2,
        shares: 1,
        followersGained: 3,
        recordedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    });

    expect(first.videoId).toBe(video.id);
    expect(second.videoId).toBe(video.id);
    expect(second.views).toBeGreaterThan(first.views);

    const snapshots = await prisma.analytics.findMany({
      where: { videoId: video.id },
      orderBy: { recordedAt: "asc" },
    });
    expect(snapshots).toHaveLength(2);
  });
});
