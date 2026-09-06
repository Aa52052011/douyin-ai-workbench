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
    expect(typeof prisma.agentRun.create).toBe("function");
    expect(typeof prisma.asset.create).toBe("function");
    expect(typeof prisma.assetLink.create).toBe("function");
    expect(typeof prisma.job.create).toBe("function");
    expect(typeof prisma.platformAccount.create).toBe("function");
    expect(typeof prisma.platformSecret.create).toBe("function");
    expect(typeof prisma.publication.create).toBe("function");
    expect(typeof prisma.publicationMetricSnapshot.create).toBe("function");
    expect(typeof prisma.productBrief.create).toBe("function");
    expect(typeof prisma.marketResearch.create).toBe("function");
    expect(typeof prisma.marketResearchSnapshot.create).toBe("function");
    expect(typeof prisma.marketInsight.create).toBe("function");
    expect(typeof prisma.campaignStrategy.create).toBe("function");
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
        "agent_runs",
        "assets",
        "asset_links",
        "jobs",
        "platform_accounts",
        "platform_secrets",
        "publications",
        "publication_metric_snapshots",
        "product_briefs",
        "market_researches",
        "market_research_snapshots",
        "market_insights",
        "campaign_strategies",
        "_prisma_migrations",
      ]),
    );
  });

  it("can drop the schema and replay migrations", async () => {
    await prisma.$disconnect();
    await rebuildSchemaAsync(databaseUrl);
    await prisma.$connect();
    const history = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM _prisma_migrations
    `;
    const names = history.map((row) => row.migration_name);
    expect(names.some((name) => name.includes("init_core_schema"))).toBe(true);
    expect(names.some((name) => name.includes("add_publication_metrics_foundation"))).toBe(true);
    expect(names.some((name) => name.includes("add_market_research_foundation"))).toBe(true);
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const tableNames = tables.map((row) => row.tablename);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "analytics",
        "publication_metric_snapshots",
        "publications",
        "product_briefs",
        "market_researches",
        "market_research_snapshots",
      ]),
    );
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
    expect(plan.version).toBe(1);
  });

  it("enforces unique content plan version per tenant and project", async () => {
    const a = await seedTenantGraph(prisma);
    const extraProject = await prisma.project.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        name: "other-project",
      },
    });
    await prisma.contentPlan.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        title: "v1",
        version: 1,
        status: "DRAFT",
      },
    });
    await prisma.contentPlan.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        title: "v2",
        version: 2,
        status: "DRAFT",
      },
    });
    const otherProjectV1 = await prisma.contentPlan.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: extraProject.id,
        title: "other-v1",
        version: 1,
        status: "DRAFT",
      },
    });
    expect(otherProjectV1.version).toBe(1);
    await expect(
      prisma.contentPlan.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          title: "dup",
          version: 1,
          status: "DRAFT",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces unique script version per tenant, content plan and topic", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const plan = await prisma.contentPlan.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        title: "plan",
        status: "CONFIRMED",
      },
    });
    const topicA = randomUUID();
    const topicB = randomUUID();
    await prisma.script.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        contentPlanId: plan.id,
        topicId: topicA,
        title: "A v1",
        version: 1,
      },
    });
    const a2 = await prisma.script.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        contentPlanId: plan.id,
        topicId: topicA,
        title: "A v2",
        version: 2,
      },
    });
    const b1 = await prisma.script.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        contentPlanId: plan.id,
        topicId: topicB,
        title: "B v1",
        version: 1,
      },
    });
    expect(a2.version).toBe(2);
    expect(b1.version).toBe(1);
    expect(a2.topicId).toBe(topicA);
    expect(a2.payload).toEqual({});
    expect(a2.topicSnapshot).toEqual({});
    expect(a2.sourceAgentRunId).toBeNull();
    await expect(
      prisma.script.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          projectId: project.id,
          contentPlanId: plan.id,
          topicId: topicA,
          title: "dup",
          version: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const otherProject = await prisma.project.create({
      data: { tenantId: tenant.id, workspaceId: workspace.id, name: "other-script-project" },
    });
    const otherPlan = await prisma.contentPlan.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: otherProject.id,
        title: "other-plan",
        status: "CONFIRMED",
      },
    });
    const other = await prisma.script.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: otherProject.id,
        contentPlanId: otherPlan.id,
        topicId: topicA,
        title: "other project v1",
        version: 1,
        payload: { hook: "ok" },
        topicSnapshot: { id: topicA, title: "snap" },
        sourceAgentRunId: randomUUID(),
      },
    });
    expect(other.version).toBe(1);
    expect(other.payload).toEqual({ hook: "ok" });
    expect(other.topicSnapshot).toEqual({ id: topicA, title: "snap" });
    expect(other.sourceAgentRunId).toBeTruthy();
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
        topicId: randomUUID(),
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
    expect(video.outputAssetId).toBeNull();
    expect(video.sourceJobId).toBeNull();
    expect(video.filePath).toBe("s3://acf/videos/demo.mp4");
  });

  it("stores assets, jobs and video output links without mixing tenants", async () => {
    const a = await seedTenantGraph(prisma);
    const b = await seedTenantGraph(prisma);
    const assetId = randomUUID();
    const objectId = randomUUID();
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        type: "VIDEO",
        status: "READY",
        storageProvider: "local",
        storageKey: `v1/${a.tenant.id}/${a.workspace.id}/${a.project.id}/${assetId}/${objectId}`,
        originalFilename: "out.mp4",
        mimeType: "video/mp4",
        size: 12,
      },
    });
    await expect(
      prisma.asset.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          type: "VIDEO",
          status: "READY",
          storageProvider: "local",
          storageKey: asset.storageKey,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const video = await prisma.video.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        outputAssetId: asset.id,
        status: "COMPLETED",
      },
    });
    const job = await prisma.job.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        kind: "VIDEO_GENERATION",
        status: "COMPLETED",
        requestId: `req-${suffix()}`,
        videoId: video.id,
        progress: 100,
      },
    });
    expect(job.attempt).toBe(0);
    expect(job.lockedAt).toBeNull();
    const link = await prisma.assetLink.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        assetId: asset.id,
        videoId: video.id,
        jobId: job.id,
        role: "VIDEO_OUTPUT",
      },
    });
    expect(link.role).toBe("VIDEO_OUTPUT");
    await expect(
      prisma.assetLink.create({
        data: {
          tenantId: b.tenant.id,
          workspaceId: b.workspace.id,
          projectId: b.project.id,
          assetId: asset.id,
          videoId: video.id,
          role: "VIDEO_OUTPUT",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("allows multiple analytics snapshots for one video (legacy Analytics, frozen)", async () => {
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

  it("stores agent runs against tenant + workspace + project", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const run = await prisma.agentRun.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        agentId: "system.echo",
        agentVersion: "v1",
        status: "COMPLETED",
        input: { message: "hello" },
        output: { message: "hello", agent: "system.echo", version: "v1" },
        requestId: randomUUID(),
        inputTokens: 2,
        outputTokens: 2,
        totalTokens: 4,
      },
    });
    expect(run.tenantId).toBe(tenant.id);
    expect(run.projectId).toBe(project.id);
    expect(run.agentId).toBe("system.echo");
  });

  it("versions product briefs and keeps one snapshot per market research", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const brief = await prisma.productBrief.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        version: 1,
        payload: { productName: "A", industry: "教育", businessGoal: "获客" },
      },
    });
    await expect(
      prisma.productBrief.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          projectId: project.id,
          version: 1,
          payload: { productName: "B", industry: "教育", businessGoal: "获客" },
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const research = await prisma.marketResearch.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        version: 1,
        status: "READY",
        productBriefId: brief.id,
        productBriefSnapshot: brief.payload,
        sourceAgentRunId: null,
        sourceJobId: null,
      },
    });
    await prisma.marketResearchSnapshot.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        marketResearchId: research.id,
        collectedAt: new Date("2026-09-01T00:00:00.000Z"),
        sources: ["MANUAL"],
      },
    });
    await expect(
      prisma.marketResearchSnapshot.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          projectId: project.id,
          marketResearchId: research.id,
          collectedAt: new Date("2026-09-02T00:00:00.000Z"),
          sources: ["MANUAL"],
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const firstInsight = await prisma.marketInsight.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        marketResearchId: research.id,
        version: 1,
        payload: { version: "v1" },
        sourceAgentRunId: null,
      },
    });
    expect(firstInsight.version).toBe(1);
    await prisma.marketInsight.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        marketResearchId: research.id,
        version: 2,
        payload: { version: "v1" },
        sourceAgentRunId: null,
      },
    });
    await expect(
      prisma.marketInsight.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          projectId: project.id,
          marketResearchId: research.id,
          version: 1,
          payload: { version: "v1" },
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("versions campaign strategies per project without overwriting", async () => {
    const { tenant, workspace, project } = await seedTenantGraph(prisma);
    const positioningRunId = randomUUID();
    const first = await prisma.campaignStrategy.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        version: 1,
        positioningRunId,
        payload: {},
        inputSnapshot: {},
        sourceAgentRunId: null,
      },
    });
    expect(first.version).toBe(1);
    await prisma.campaignStrategy.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        projectId: project.id,
        version: 2,
        positioningRunId,
        payload: {},
        inputSnapshot: {},
      },
    });
    await expect(
      prisma.campaignStrategy.create({
        data: {
          tenantId: tenant.id,
          workspaceId: workspace.id,
          projectId: project.id,
          version: 1,
          positioningRunId,
          payload: {},
          inputSnapshot: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
