import { PrismaClient, SecretKind } from '@prisma/client';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { decryptAesGcm, encryptAesGcm } from './aes-gcm.js';
import { readPlatformSecretMasterKey } from './secret-master-key.js';
import { decodeSecretPayload, encodeSecretPayload } from './secret-payload.js';
import {
  PLATFORM_SECRET_KEY_VERSION,
  type SecretPayload,
  type SecretPutInput,
  type SecretReference,
  type SecretScope,
  type SecretStore,
} from './secret.types.js';

export class EncryptedDbSecretStore implements SecretStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly masterKeyFn: () => Buffer = readPlatformSecretMasterKey,
  ) {}

  async put(input: SecretPutInput): Promise<SecretReference> {
    const plaintext = encodeSecretPayload(input.payload);
    const box = encryptAesGcm(plaintext, this.masterKeyFn());
    const created = await this.prisma.platformSecret.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        kind: SecretKind.PLATFORM_OAUTH,
        cipher: new Uint8Array(box.cipher),
        nonce: new Uint8Array(box.nonce),
        authTag: new Uint8Array(box.authTag),
        keyVersion: PLATFORM_SECRET_KEY_VERSION,
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async get(ref: SecretReference, scope: SecretScope): Promise<SecretPayload> {
    const row = await this.findScoped(ref, scope);
    if (row.revokedAt) {
      throw new AppError(ErrorCode.SECRET_REVOKED);
    }
    const plaintext = decryptAesGcm(
      {
        cipher: Buffer.from(row.cipher),
        nonce: Buffer.from(row.nonce),
        authTag: Buffer.from(row.authTag),
      },
      this.masterKeyFn(),
    );
    return decodeSecretPayload(plaintext);
  }

  async revoke(ref: SecretReference, scope: SecretScope): Promise<void> {
    const row = await this.findScoped(ref, scope);
    if (row.revokedAt) {
      return;
    }
    await this.prisma.platformSecret.updateMany({
      where: { id: row.id, tenantId: scope.tenantId, workspaceId: scope.workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findScoped(ref: SecretReference, scope: SecretScope) {
    if (!isUuid(ref.id) || !isUuid(scope.tenantId) || !isUuid(scope.workspaceId)) {
      throw new AppError(ErrorCode.SECRET_NOT_FOUND);
    }
    const row = await this.prisma.platformSecret.findFirst({
      where: { id: ref.id, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    });
    if (!row) {
      throw new AppError(ErrorCode.SECRET_NOT_FOUND);
    }
    return row;
  }
}
