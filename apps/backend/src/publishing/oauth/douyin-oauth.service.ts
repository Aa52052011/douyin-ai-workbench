import { Inject, Injectable } from '@nestjs/common';
import { Platform, PlatformAccountStatus, PrismaClient, type PlatformAccount } from '@prisma/client';
import type { AuthContext } from '../../auth/auth.types.js';
import { resolveWorkspaceId } from '../../authz/workspace-context.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import type { SecretStore } from '../secrets/secret.types.js';
import { SECRET_STORE } from '../secrets/secret.types.js';
import {
  assertDouyinOAuthConfigured,
  DOUYIN_ACCESS_TOKEN_REFRESH_WINDOW_MS,
  DOUYIN_OAUTH_STATE_TTL_MS,
  evaluateGrantedScopes,
  formatDouyinScopeParam,
  joinDouyinAuthorizeUrl,
  scopesForOAuthPurpose,
  type DouyinOAuthPurpose,
} from './douyin-oauth.config.js';
import { sanitizeDouyinOAuthError } from './douyin-oauth.errors.js';
import type { DouyinOAuthClient, DouyinTokenSet } from './douyin-oauth.types.js';
import { DOUYIN_OAUTH_CLIENT } from './douyin-oauth.types.js';
import {
  buildOAuthStateContext,
  generateOAuthState,
  OAUTH_STATE_STORE,
  type OAuthStateStore,
} from './oauth-state.js';
import {
  toPublicPlatformAccountDetail,
  type PlatformAccountPublic,
} from '../platform-accounts.mapper.js';

type DouyinAccountMetadata = {
  avatarUrl?: string;
};

@Injectable()
export class DouyinOAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    @Inject(DOUYIN_OAUTH_CLIENT) private readonly oauth: DouyinOAuthClient,
    @Inject(OAUTH_STATE_STORE) private readonly states: OAuthStateStore,
  ) {}

  async startConnect(
    auth: AuthContext,
    workspaceHint?: string,
    purpose: DouyinOAuthPurpose = 'PUBLISHING',
  ): Promise<{ authorizationUrl: string; purpose: DouyinOAuthPurpose; requestedScopes: string[] }> {
    const config = assertDouyinOAuthConfigured();
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const requestedScopes = scopesForOAuthPurpose(purpose);
    const state = generateOAuthState();
    const context = buildOAuthStateContext({
      tenantId: auth.tenantId,
      workspaceId,
      userId: auth.userId,
      requestedScopes,
      ttlMs: DOUYIN_OAUTH_STATE_TTL_MS,
    });
    await this.states.save(state, context, DOUYIN_OAUTH_STATE_TTL_MS);
    const url = new URL(joinDouyinAuthorizeUrl(config.oauthBaseUrl));
    url.searchParams.set('client_key', config.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', formatDouyinScopeParam(requestedScopes));
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('state', state);
    return { authorizationUrl: url.toString(), purpose, requestedScopes };
  }

  async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<PlatformAccountPublic> {
    const consumed = await this.consumeState(query.state);
    if (query.error) {
      throw new AppError(ErrorCode.DOUYIN_OAUTH_DENIED);
    }
    if (!query.code) {
      throw new AppError(ErrorCode.DOUYIN_OAUTH_INVALID_CODE);
    }
    try {
      const tokens = await this.oauth.exchangeCode({ code: query.code });
      evaluateGrantedScopes({
        purpose: consumed.requestedScopes.includes('video.create.bind') ? 'PUBLISHING' : 'LOGIN_ONLY',
        granted: tokens.scopes,
      });
      const user = await this.oauth.getUserInfo({
        accessToken: tokens.accessToken,
        openId: tokens.openId,
      });
      if (user.openId !== tokens.openId) {
        throw new AppError(ErrorCode.DOUYIN_USER_INFO_FAILED);
      }
      return await this.persistAuthorizedAccount(consumed, tokens, {
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    } catch (error) {
      throw sanitizeDouyinOAuthError(error);
    }
  }

  async list(
    auth: AuthContext,
    query: { platform?: Platform },
    workspaceHint?: string,
  ): Promise<PlatformAccountPublic[]> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const rows = await this.prisma.platformAccount.findMany({
      where: {
        tenantId: auth.tenantId,
        workspaceId,
        platform: query.platform,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toPublicPlatformAccountDetail(row));
  }

  async getById(auth: AuthContext, id: string, workspaceHint?: string): Promise<PlatformAccountPublic> {
    const account = await this.requireAccount(auth, id, workspaceHint);
    return toPublicPlatformAccountDetail(account);
  }

  async disconnect(auth: AuthContext, id: string, workspaceHint?: string): Promise<PlatformAccountPublic> {
    const account = await this.requireAccount(auth, id, workspaceHint);
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    const updated = await this.prisma.platformAccount.update({
      where: { id_tenantId: { id: account.id, tenantId: auth.tenantId } },
      data: { status: PlatformAccountStatus.DISCONNECTED },
    });
    try {
      await this.secrets.revoke({ id: account.credentialRef }, { tenantId: auth.tenantId, workspaceId });
    } catch (error) {
      if (!(error instanceof AppError && error.code === ErrorCode.SECRET_NOT_FOUND)) {
        throw error;
      }
    }
    return toPublicPlatformAccountDetail(updated);
  }

  async refreshDouyinCredential(auth: AuthContext, id: string, workspaceHint?: string): Promise<PlatformAccountPublic> {
    const account = await this.requireAccount(auth, id, workspaceHint);
    return this.rotateCredential(account, { force: true });
  }

  async ensureValidCredential(account: PlatformAccount): Promise<void> {
    if (account.status !== PlatformAccountStatus.ACTIVE) {
      throw new AppError(ErrorCode.PLATFORM_REAUTH_REQUIRED);
    }
    await this.rotateCredential(account, { force: false });
  }

  private async rotateCredential(
    account: PlatformAccount,
    options: { force: boolean },
  ): Promise<PlatformAccountPublic> {
    if (account.platform !== Platform.DOUYIN) {
      throw new AppError(ErrorCode.PUBLISH_PLATFORM_MISMATCH);
    }
    if (account.status === PlatformAccountStatus.DISCONNECTED) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_INACTIVE);
    }
    const scope = { tenantId: account.tenantId, workspaceId: account.workspaceId };
    const payload = await this.secrets.get({ id: account.credentialRef }, scope);
    const now = Date.now();
    if (payload.refreshExpiresAt && Date.parse(payload.refreshExpiresAt) <= now) {
      await this.markExpired(account);
      throw new AppError(ErrorCode.PLATFORM_REAUTH_REQUIRED);
    }
    if (!payload.refreshToken) {
      await this.markExpired(account);
      throw new AppError(ErrorCode.PLATFORM_REAUTH_REQUIRED);
    }
    const accessExpiresAt = payload.expiresAt ? Date.parse(payload.expiresAt) : NaN;
    const needsRefresh =
      options.force ||
      !Number.isFinite(accessExpiresAt) ||
      accessExpiresAt - now <= DOUYIN_ACCESS_TOKEN_REFRESH_WINDOW_MS;
    if (!needsRefresh) {
      return toPublicPlatformAccountDetail(account);
    }
    try {
      const tokens = await this.oauth.refreshToken({ refreshToken: payload.refreshToken });
      return await this.persistTokenRotation(account, tokens);
    } catch (error) {
      const sanitized = sanitizeDouyinOAuthError(error);
      if (sanitized.code === ErrorCode.DOUYIN_REAUTH_REQUIRED) {
        await this.markExpired(account);
        throw new AppError(ErrorCode.PLATFORM_REAUTH_REQUIRED);
      }
      throw sanitized;
    }
  }

  private async persistAuthorizedAccount(
    context: { tenantId: string; workspaceId: string },
    tokens: DouyinTokenSet,
    profile: { displayName: string; avatarUrl?: string },
  ): Promise<PlatformAccountPublic> {
    const existing = await this.prisma.platformAccount.findFirst({
      where: {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        platform: Platform.DOUYIN,
        externalAccountId: tokens.openId,
        deletedAt: null,
      },
    });
    const secretRef = await this.secrets.put({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      kind: 'PLATFORM_OAUTH',
      payload: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        scopes: tokens.scopes,
      },
    });
    const now = new Date();
    const metadata: DouyinAccountMetadata = profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {};
    const data = {
      displayName: profile.displayName,
      status: PlatformAccountStatus.ACTIVE,
      credentialRef: secretRef.id,
      scopes: tokens.scopes,
      metadata,
      connectedAt: now,
      expiresAt: new Date(tokens.accessExpiresAt),
      lastRefreshedAt: now,
      deletedAt: null,
    };
    try {
      const account = existing
        ? await this.prisma.platformAccount.update({
            where: { id_tenantId: { id: existing.id, tenantId: context.tenantId } },
            data,
          })
        : await this.prisma.platformAccount.create({
            data: {
              tenantId: context.tenantId,
              workspaceId: context.workspaceId,
              platform: Platform.DOUYIN,
              externalAccountId: tokens.openId,
              ...data,
            },
          });
      if (existing && existing.credentialRef !== secretRef.id) {
        await this.secrets.revoke(
          { id: existing.credentialRef },
          { tenantId: context.tenantId, workspaceId: context.workspaceId },
        );
      }
      return toPublicPlatformAccountDetail(account);
    } catch (error) {
      await this.secrets.revoke(secretRef, { tenantId: context.tenantId, workspaceId: context.workspaceId });
      throw error;
    }
  }

  private async persistTokenRotation(account: PlatformAccount, tokens: DouyinTokenSet): Promise<PlatformAccountPublic> {
    const scope = { tenantId: account.tenantId, workspaceId: account.workspaceId };
    const secretRef = await this.secrets.put({
      tenantId: account.tenantId,
      workspaceId: account.workspaceId,
      kind: 'PLATFORM_OAUTH',
      payload: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        scopes: tokens.scopes.length > 0 ? tokens.scopes : account.scopes,
      },
    });
    const now = new Date();
    try {
      const updated = await this.prisma.platformAccount.update({
        where: { id_tenantId: { id: account.id, tenantId: account.tenantId } },
        data: {
          status: PlatformAccountStatus.ACTIVE,
          credentialRef: secretRef.id,
          scopes: tokens.scopes.length > 0 ? tokens.scopes : account.scopes,
          expiresAt: new Date(tokens.accessExpiresAt),
          lastRefreshedAt: now,
        },
      });
      if (account.credentialRef !== secretRef.id) {
        await this.secrets.revoke({ id: account.credentialRef }, scope);
      }
      return toPublicPlatformAccountDetail(updated);
    } catch (error) {
      await this.secrets.revoke(secretRef, scope);
      throw error;
    }
  }

  private async markExpired(account: PlatformAccount): Promise<void> {
    await this.prisma.platformAccount.updateMany({
      where: { id: account.id, tenantId: account.tenantId, status: { not: PlatformAccountStatus.DISCONNECTED } },
      data: { status: PlatformAccountStatus.EXPIRED },
    });
  }

  private async consumeState(state: string | undefined) {
    if (!state) {
      throw new AppError(ErrorCode.DOUYIN_OAUTH_INVALID_STATE);
    }
    const result = await this.states.consume(state);
    if (!result.ok && result.reason === 'expired') {
      throw new AppError(ErrorCode.DOUYIN_OAUTH_STATE_EXPIRED);
    }
    if (!result.ok) {
      throw new AppError(ErrorCode.DOUYIN_OAUTH_INVALID_STATE);
    }
    return result.context;
  }

  private async requireAccount(auth: AuthContext, id: string, workspaceHint?: string): Promise<PlatformAccount> {
    const workspaceId = resolveWorkspaceId(auth, workspaceHint);
    if (!isUuid(id)) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    const account = await this.prisma.platformAccount.findFirst({
      where: { id, tenantId: auth.tenantId, workspaceId, deletedAt: null },
    });
    if (!account) {
      throw new AppError(ErrorCode.PLATFORM_ACCOUNT_NOT_FOUND);
    }
    return account;
  }
}
