import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { EncryptedDbSecretStore } from './encrypted-db.secret-store.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SECRET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DUMMY = { accessToken: 'dummy-access-not-a-real-token' };

describe('EncryptedDbSecretStore isolation', () => {
  const prisma = {
    platformSecret: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const masterKey = randomBytes(32);
  let store: EncryptedDbSecretStore;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new EncryptedDbSecretStore(prisma as never, () => masterKey);
  });

  it('does not return secrets across tenant or workspace', async () => {
    prisma.platformSecret.findFirst.mockResolvedValue(null);
    await expect(store.get({ id: SECRET_ID }, { tenantId: OTHER, workspaceId: WORKSPACE })).rejects.toMatchObject({
      code: ErrorCode.SECRET_NOT_FOUND,
    });
    await expect(store.get({ id: SECRET_ID }, { tenantId: TENANT, workspaceId: OTHER })).rejects.toMatchObject({
      code: ErrorCode.SECRET_NOT_FOUND,
    });
    expect(prisma.platformSecret.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SECRET_ID, tenantId: OTHER, workspaceId: WORKSPACE } }),
    );
  });

  it('refuses revoked secrets as active credentials', async () => {
    prisma.platformSecret.findFirst.mockResolvedValue({
      id: SECRET_ID,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      revokedAt: new Date(),
      cipher: Buffer.from([1]),
      nonce: Buffer.from([2]),
      authTag: Buffer.from([3]),
    });
    await expect(store.get({ id: SECRET_ID }, { tenantId: TENANT, workspaceId: WORKSPACE })).rejects.toMatchObject({
      code: ErrorCode.SECRET_REVOKED,
    });
  });

  it('does not persist plaintext in the create payload', async () => {
    prisma.platformSecret.create.mockResolvedValue({ id: SECRET_ID });
    await store.put({
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      kind: 'PLATFORM_OAUTH',
      payload: DUMMY,
    });
    const data = prisma.platformSecret.create.mock.calls[0]?.[0]?.data as {
      cipher: Uint8Array;
      nonce: Uint8Array;
      authTag: Uint8Array;
    };
    expect(data.cipher).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(data.cipher).toString('utf8')).not.toContain(DUMMY.accessToken);
    expect(JSON.stringify(data)).not.toContain(DUMMY.accessToken);
  });
});

describe('EncryptedDbSecretStore errors', () => {
  it('does not leak dummy secrets in AppError JSON', () => {
    const error = new AppError(ErrorCode.SECRET_NOT_FOUND);
    expect(JSON.stringify(error)).not.toContain('dummy-access');
    expect(JSON.stringify(error)).not.toContain('PLATFORM_SECRET_MASTER_KEY');
  });
});
