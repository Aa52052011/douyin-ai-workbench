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

async function seedTenantGraph(prisma: PrismaClient) {
  const tag = suffix();
  const user = await prisma.user.create({
    data: {
      email: `pub-${tag}@example.com`,
      passwordHash: "not-a-real-hash",
      name: "Publisher",
    },
  });
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${tag}`, slug: `tenant-pub-${tag}` },
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
  return { user, tenant, workspace, project, video, tag };
}

describe("publishing foundation schema", () => {
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

  it("creates a PlatformAccount with tenant/workspace uniqueness", async () => {
    const a = await seedTenantGraph(prisma);
    const account = await prisma.platformAccount.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        platform: "DOUYIN",
        externalAccountId: `ext-${a.tag}`,
        displayName: "Demo",
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
    expect(account.status).toBe("ACTIVE");
    await expect(
      prisma.platformAccount.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          platform: "DOUYIN",
          externalAccountId: `ext-${a.tag}`,
          displayName: "Dup",
          credentialRef: randomUUID(),
          connectedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Pick<Prisma.PrismaClientKnownRequestError, "code">);
  });

  it("rejects PlatformAccount rows that cross tenant workspace", async () => {
    const a = await seedTenantGraph(prisma);
    const b = await seedTenantGraph(prisma);
    await expect(
      prisma.platformAccount.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: b.workspace.id,
          platform: "MOCK",
          externalAccountId: `cross-${suffix()}`,
          displayName: "Cross",
          credentialRef: randomUUID(),
          connectedAt: new Date(),
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("creates a Publication bound to the same tenant video", async () => {
    const a = await seedTenantGraph(prisma);
    const publication = await prisma.publication.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        platform: "DOUYIN",
        mode: "API",
        title: "Demo",
        visibility: "PUBLIC",
        idempotencyKey: `idem-${a.tag}`,
        createdByUserId: a.user.id,
      },
    });
    expect(publication.status).toBe("PENDING");
    expect(publication.platformAccountId).toBeNull();
  });

  it("rejects Publication video isolation mismatches", async () => {
    const a = await seedTenantGraph(prisma);
    const b = await seedTenantGraph(prisma);
    await expect(
      prisma.publication.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          videoId: b.video.id,
          platform: "DOUYIN",
          mode: "MANUAL",
          title: "Cross",
          visibility: "PUBLIC",
          idempotencyKey: `idem-cross-${suffix()}`,
          createdByUserId: a.user.id,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("allows MANUAL publications without a platform account", async () => {
    const a = await seedTenantGraph(prisma);
    const publication = await prisma.publication.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        platform: "DOUYIN",
        mode: "MANUAL",
        title: "Manual",
        visibility: "PUBLIC",
        idempotencyKey: `idem-manual-${a.tag}`,
        createdByUserId: a.user.id,
      },
    });
    expect(publication.mode).toBe("MANUAL");
    expect(publication.platformAccountId).toBeNull();
  });

  it("enforces tenant idempotencyKey uniqueness", async () => {
    const a = await seedTenantGraph(prisma);
    const key = `idem-unique-${a.tag}`;
    await prisma.publication.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        platform: "MOCK",
        mode: "MANUAL",
        title: "One",
        visibility: "PUBLIC",
        idempotencyKey: key,
        createdByUserId: a.user.id,
      },
    });
    await expect(
      prisma.publication.create({
        data: {
          tenantId: a.tenant.id,
          workspaceId: a.workspace.id,
          projectId: a.project.id,
          videoId: a.video.id,
          platform: "MOCK",
          mode: "MANUAL",
          title: "Two",
          visibility: "PUBLIC",
          idempotencyKey: key,
          createdByUserId: a.user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" } satisfies Pick<Prisma.PrismaClientKnownRequestError, "code">);
  });

  it("allows multiple historical publications for the same video and account", async () => {
    const a = await seedTenantGraph(prisma);
    const account = await prisma.platformAccount.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        platform: "DOUYIN",
        externalAccountId: `hist-${a.tag}`,
        displayName: "Hist",
        credentialRef: randomUUID(),
        connectedAt: new Date(),
      },
    });
    const first = await prisma.publication.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        platformAccountId: account.id,
        platform: "DOUYIN",
        mode: "API",
        status: "PUBLISHED",
        title: "First",
        visibility: "PUBLIC",
        idempotencyKey: `idem-hist-1-${a.tag}`,
        createdByUserId: a.user.id,
      },
    });
    const second = await prisma.publication.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        videoId: a.video.id,
        platformAccountId: account.id,
        platform: "DOUYIN",
        mode: "API",
        title: "Second",
        visibility: "PUBLIC",
        idempotencyKey: `idem-hist-2-${a.tag}`,
        createdByUserId: a.user.id,
      },
    });
    expect(first.platformAccountId).toBe(account.id);
    expect(second.platformAccountId).toBe(account.id);
    expect(first.id).not.toBe(second.id);
  });

  it("persists PlatformSecret as ciphertext, not plaintext", async () => {
    const a = await seedTenantGraph(prisma);
    const plaintext = "dummy-access-not-a-real-token";
    const secret = await prisma.platformSecret.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        kind: "PLATFORM_OAUTH",
        cipher: Buffer.from("ciphertext-not-plaintext"),
        nonce: Buffer.alloc(12, 1),
        authTag: Buffer.alloc(16, 2),
        keyVersion: 1,
      },
    });
    expect(Buffer.isBuffer(secret.cipher) || secret.cipher instanceof Uint8Array).toBe(true);
    expect(Buffer.from(secret.cipher).toString("utf8")).not.toBe(plaintext);
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'platform_secrets'
    `;
    const names = columns.map((row) => row.column_name);
    expect(names).not.toContain("access_token");
    expect(names).not.toContain("refresh_token");
    expect(names).toEqual(expect.arrayContaining(["cipher", "nonce", "auth_tag", "key_version"]));
  });

  it("includes VIDEO_PUBLISH in JobKind", async () => {
    const a = await seedTenantGraph(prisma);
    const job = await prisma.job.create({
      data: {
        tenantId: a.tenant.id,
        workspaceId: a.workspace.id,
        projectId: a.project.id,
        kind: "VIDEO_PUBLISH",
        requestId: `req-${suffix()}`,
        videoId: a.video.id,
        input: { publicationId: randomUUID() },
      },
    });
    expect(job.kind).toBe("VIDEO_PUBLISH");
  });
});
