export const SECRET_STORE = Symbol('SECRET_STORE');

export const PLATFORM_SECRET_KEY_VERSION = 1;
export const PLATFORM_SECRET_MASTER_KEY_BYTES = 32;
export const PLATFORM_SECRET_NONCE_BYTES = 12;
export const PLATFORM_SECRET_AUTH_TAG_BYTES = 16;

export type SecretReference = {
  id: string;
};

export type SecretScope = {
  tenantId: string;
  workspaceId: string;
};

export type PlatformOAuthSecretPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
  scopes?: string[];
};

export type SecretPayload = PlatformOAuthSecretPayload;

export type SecretPutInput = SecretScope & {
  kind: 'PLATFORM_OAUTH';
  payload: SecretPayload;
};

export interface SecretStore {
  put(input: SecretPutInput): Promise<SecretReference>;
  get(ref: SecretReference, scope: SecretScope): Promise<SecretPayload>;
  revoke(ref: SecretReference, scope: SecretScope): Promise<void>;
}
