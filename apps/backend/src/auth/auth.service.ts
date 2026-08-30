import { Injectable } from '@nestjs/common';
import { MembershipRole, Prisma, PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import { accessTtlSeconds, refreshTtlSeconds } from './auth.constants.js';
import type { AuthContext, AuthSession, PublicUser } from './auth.types.js';
import { LoginThrottle } from './login-throttle.js';
import { PasswordService } from './password.service.js';
import { TokenService, hashRefreshToken } from './token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly throttle: LoginThrottle,
  ) {}

  async register(input: { email: string; password: string; name: string }): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(ErrorCode.AUTH_EMAIL_EXISTS);
    }

    const passwordHash = await this.passwords.hash(input.password);
    const tenantSlug = tenantSlugFromEmail(email);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, name },
        });
        const tenant = await tx.tenant.create({
          data: {
            name: `${name} 的工作台`,
            slug: tenantSlug,
          },
        });
        const workspace = await tx.workspace.create({
          data: {
            tenantId: tenant.id,
            name: '默认工作空间',
            slug: 'default',
          },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: MembershipRole.OWNER,
          },
        });
        return { user, tenant, workspace, membership };
      });

      return this.issueSession({
        userId: created.user.id,
        tenantId: created.tenant.id,
        workspaceId: created.workspace.id,
        role: created.membership.role,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target;
        if (Array.isArray(target) && target.includes('email')) {
          throw new AppError(ErrorCode.AUTH_EMAIL_EXISTS);
        }
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unable to complete registration');
      }
      throw error;
    }
  }

  async login(
    input: { email: string; password: string },
    meta: { ip: string },
  ): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    if (!this.throttle.allow({ ip: meta.ip, email })) {
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = await this.passwords.verify(
      user?.passwordHash ??
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      input.password,
    );

    if (!user || user.deletedAt || !passwordOk) {
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const context = await this.loadDefaultContext(user.id);
    return this.issueSession(context);
  }

  async refresh(rawToken: string | undefined): Promise<AuthSession> {
    if (!rawToken) {
      throw new AppError(ErrorCode.AUTH_REFRESH_INVALID);
    }

    const tokenHash = hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new AppError(ErrorCode.AUTH_REFRESH_INVALID);
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new AppError(ErrorCode.AUTH_REFRESH_REVOKED);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      throw new AppError(ErrorCode.AUTH_REFRESH_INVALID);
    }

    const context = await this.loadDefaultContext(stored.userId);
    const next = this.tokens.createRefreshToken();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: next.tokenHash,
          expiresAt: new Date(Date.now() + refreshTtlSeconds() * 1000),
          ipAddress: stored.ipAddress,
          userAgent: stored.userAgent,
        },
      }),
    ]);

    return {
      ...(await this.toSession(context)),
      refreshRaw: next.raw,
    } as AuthSession & { refreshRaw: string };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    const tokenHash = hashRefreshToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(ctx: AuthContext): Promise<Omit<AuthSession, 'accessToken' | 'expiresIn'>> {
    const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
    });
    if (!user || user.deletedAt || !tenant || tenant.deletedAt || !workspace || workspace.deletedAt) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    if (workspace.tenantId !== tenant.id || workspace.tenantId !== ctx.tenantId) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    return {
      user: toPublicUser(user),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      role: ctx.role,
    };
  }

  async issueSession(
    ctx: AuthContext,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthSession & { refreshRaw: string }> {
    const refresh = this.tokens.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: ctx.userId,
        tokenHash: refresh.tokenHash,
        expiresAt: new Date(Date.now() + refreshTtlSeconds() * 1000),
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });
    const session = await this.toSession(ctx);
    return { ...session, refreshRaw: refresh.raw };
  }

  private async toSession(ctx: AuthContext): Promise<AuthSession> {
    const view = await this.me(ctx);
    return {
      ...view,
      accessToken: this.tokens.signAccess(ctx),
      expiresIn: accessTtlSeconds(),
    };
  }

  private async loadDefaultContext(userId: string): Promise<AuthContext> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    const workspace = await this.prisma.workspace.findFirst({
      where: { tenantId: membership.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!workspace) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
    }
    return {
      userId,
      tenantId: membership.tenantId,
      workspaceId: workspace.id,
      role: membership.role,
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function tenantSlugFromEmail(email: string): string {
  const base = normalizeEmail(email)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `t-${base}`;
}

function toPublicUser(user: { id: string; email: string; name: string; createdAt: Date }): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
