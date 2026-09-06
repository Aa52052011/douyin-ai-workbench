import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateClient,
  getPrisma,
  migrateDeploy,
  startTestDatabase,
  stopTestDatabase,
} from "./harness.js";

function suffix(): string {
  return randomUUID().slice(0, 8);
}

async function seedPublication(prisma: PrismaClient) {
  const tag = suffix();
  const user = await prisma.user.create({
    data: {
      email: `metrics-${tag}@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Metrics",
    },
  });
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${tag}`, slug: `tenant-metrics-${tag}` },
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
  });
  const workspace = await prisma.workspace.create({
    data: { tenantId: tenant.id, name: "Default", slug: "default" },
  });
  const project = await prisma.project.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, name: "Project" },
  });
  const video = await prisma.video.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      projectId: project.id,
      status: "COMPLETED",
    },
  });
  const publication = await prisma.publication.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      projectId: project.id,
      videoId: video.id,
      platform: "DOUYIN",
      mode: "MANUAL",
      title: "Demo",
      visibility: "PUBLIC",
      idempotencyKey: `idem-metrics-${tag}`,
      createdByUserId: user.id,
    },
  });
  return { user, tenant, workspace, project, video, publication, tag };
}

describe("publication metric snapshot schema", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    generateClient();
    const databaseUrl = await startTestDatabase();
    migrateDeploy(databaseUrl);
    prisma = getPrisma(databaseUrl);
    await prisma.$connect();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("creates a PublicationMetricSnapshot bound to a Publication", async () => {
    const a = await seedPublication(prisma);
    const snapshot = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: a.publication.platform,
        source: "API",
        collectionKey: `collect-${a.tag}`,
        observedAt: new Date("2026-09-02T00:00:00.000Z"),
        provider: "MOCK",
      },
    });
    expect(snapshot.publicationId).toBe(a.publication.id);
    expect(snapshot.platform).toBe("DOUYIN");
    expect(snapshot.source).toBe("API");
    expect(snapshot.provider).toBe("MOCK");
    expect(snapshot.sourceJobId).toBeNull();
    expect(snapshot.providerMetadata).toEqual({});
  });

  it("rejects snapshots that point at another tenant Publication", async () => {
    const a = await seedPublication(prisma);
    const b = await seedPublication(prisma);
    await expect(
      prisma.publicationMetricSnapshot.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          publicationId: b.publication.id,
          platform: "DOUYIN",
          source: "MANUAL",
          collectionKey: `cross-tenant-${suffix()}`,
          observedAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("rejects workspace/project mismatches against the Publication scope", async () => {
    const a = await seedPublication(prisma);
    const otherProject = await prisma.project.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        name: "Other",
      },
    });
    await expect(
      prisma.publicationMetricSnapshot.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: otherProject.id,
          publicationId: a.publication.id,
          platform: "DOUYIN",
          source: "MANUAL",
          collectionKey: `cross-project-${suffix()}`,
          observedAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("allows multiple snapshots for the same Publication", async () => {
    const a = await seedPublication(prisma);
    const first = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: `first-${a.tag}`,
        observedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    const second = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: `second-${a.tag}`,
        observedAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    });
    expect(first.publicationId).toBe(second.publicationId);
    expect(first.id).not.toBe(second.id);
  });

  it("rejects the same collectionKey for the same source", async () => {
    const a = await seedPublication(prisma);
    const key = `dup-${a.tag}`;
    await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: key,
        observedAt: new Date(),
      },
    });
    await expect(
      prisma.publicationMetricSnapshot.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          publicationId: a.publication.id,
          platform: "DOUYIN",
          source: "API",
          collectionKey: key,
          observedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Pick<Prisma.PrismaClientKnownRequestError, "code">);
  });

  it("allows the same collectionKey for a different source", async () => {
    const a = await seedPublication(prisma);
    const key = `shared-${a.tag}`;
    await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: key,
        observedAt: new Date(),
      },
    });
    const manual = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "MANUAL",
        collectionKey: key,
        observedAt: new Date(),
      },
    });
    expect(manual.source).toBe("MANUAL");
  });

  it("stores omitted metrics as null and preserves explicit zeros", async () => {
    const a = await seedPublication(prisma);
    const unknown = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "MANUAL",
        collectionKey: `null-${a.tag}`,
        observedAt: new Date(),
      },
    });
    expect(unknown.views).toBeNull();
    expect(unknown.likes).toBeNull();
    expect(unknown.comments).toBeNull();
    expect(unknown.shares).toBeNull();
    expect(unknown.favorites).toBeNull();
    expect(unknown.averageWatchTimeSeconds).toBeNull();
    expect(unknown.completionRate).toBeNull();
    expect(unknown.newFollowers).toBeNull();

    const zero = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "MANUAL",
        collectionKey: `zero-${a.tag}`,
        observedAt: new Date(),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        favorites: 0,
        averageWatchTimeSeconds: new Prisma.Decimal("0"),
        completionRate: new Prisma.Decimal("0"),
        newFollowers: 0,
      },
    });
    expect(zero.views).toBe(0);
    expect(zero.likes).toBe(0);
    expect(zero.comments).toBe(0);
    expect(zero.shares).toBe(0);
    expect(zero.favorites).toBe(0);
    expect(zero.newFollowers).toBe(0);
    expect(zero.averageWatchTimeSeconds?.toString()).toBe("0");
    expect(zero.completionRate?.toString()).toBe("0");
  });

  it("stores completionRate as 0-1 decimal, not percent", async () => {
    const a = await seedPublication(prisma);
    const snapshot = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: `rate-${a.tag}`,
        observedAt: new Date(),
        completionRate: new Prisma.Decimal("0.63"),
        averageWatchTimeSeconds: new Prisma.Decimal("8.250"),
      },
    });
    expect(snapshot.completionRate?.toString()).toBe("0.63");
    expect(Number(snapshot.completionRate)).toBeLessThanOrEqual(1);
    expect(snapshot.averageWatchTimeSeconds?.toString()).toBe("8.25");
  });

  it("keeps sourceJobId nullable and accepts a UUID without a Job FK", async () => {
    const a = await seedPublication(prisma);
    const snapshot = await prisma.publicationMetricSnapshot.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        publicationId: a.publication.id,
        platform: "DOUYIN",
        source: "API",
        collectionKey: `jobref-${a.tag}`,
        observedAt: new Date(),
        sourceJobId: randomUUID(),
      },
    });
    expect(snapshot.sourceJobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("includes PUBLICATION_METRICS_SYNC in JobKind", async () => {
    const a = await seedPublication(prisma);
    const job = await prisma.job.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        kind: "PUBLICATION_METRICS_SYNC",
        requestId: `req-metrics-${a.tag}`,
        videoId: a.video.id,
        input: { publicationId: a.publication.id },
      },
    });
    expect(job.kind).toBe("PUBLICATION_METRICS_SYNC");
  });

  it("keeps legacy Analytics and prior migrations", async () => {
    const a = await seedPublication(prisma);
    const analytics = await prisma.analytics.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        views: 10,
        recordedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    expect(analytics.videoId).toBe(a.video.id);
    expect(analytics.views).toBe(10);

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const names = tables.map((row) => row.tablename);
    expect(names).toContain("analytics");
    expect(names).toContain("publication_metric_snapshots");

    const history = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
      ORDER BY started_at
    `;
    const migrationNames = history.map((row) => row.migration_name);
    expect(migrationNames.some((name) => name.includes("init_core_schema"))).toBe(true);
    expect(migrationNames.some((name) => name.includes("add_publication_metrics_foundation"))).toBe(true);
  });
});
