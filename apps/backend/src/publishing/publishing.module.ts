import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MediaModule } from '../media/media.module.js';
import { StorageService } from '../media/storage/storage.service.js';
import { EncryptedDbSecretStore } from './secrets/encrypted-db.secret-store.js';
import { SECRET_STORE } from './secrets/secret.types.js';
import { MockPublishingProvider } from './providers/mock-publishing.provider.js';
import { PublishingProviderRegistry } from './providers/publishing-provider.registry.js';
import { PUBLISHING_PROVIDER_REGISTRY } from './providers/publishing.token.js';
import { PublicationsController } from './publications.controller.js';
import { PublicationsService } from './publications.service.js';
import { PublishExecutionService } from './publish-execution.service.js';
import { createDouyinOAuthClient } from './oauth/create-douyin-oauth-client.js';
import { createOAuthStateStore } from './oauth/create-oauth-state-store.js';
import { DouyinOAuthService } from './oauth/douyin-oauth.service.js';
import { DOUYIN_OAUTH_CLIENT } from './oauth/douyin-oauth.types.js';
import { OAUTH_STATE_STORE } from './oauth/oauth-state.js';
import { PlatformAccountsController } from './platform-accounts.controller.js';

@Module({
  imports: [MediaModule, JobsModule, AuthModule, AuthzModule],
  controllers: [PublicationsController, PlatformAccountsController],
  providers: [
    {
      provide: EncryptedDbSecretStore,
      useFactory: (prisma: PrismaClient) => new EncryptedDbSecretStore(prisma),
      inject: [PrismaClient],
    },
    {
      provide: SECRET_STORE,
      useExisting: EncryptedDbSecretStore,
    },
    {
      provide: MockPublishingProvider,
      useFactory: (storage: StorageService) => new MockPublishingProvider(storage),
      inject: [StorageService],
    },
    PublishingProviderRegistry,
    {
      provide: PUBLISHING_PROVIDER_REGISTRY,
      useExisting: PublishingProviderRegistry,
    },
    {
      provide: DOUYIN_OAUTH_CLIENT,
      useFactory: createDouyinOAuthClient,
    },
    {
      provide: OAUTH_STATE_STORE,
      useFactory: createOAuthStateStore,
    },
    DouyinOAuthService,
    PublicationsService,
    PublishExecutionService,
  ],
  exports: [
    SECRET_STORE,
    EncryptedDbSecretStore,
    MockPublishingProvider,
    PublishingProviderRegistry,
    PUBLISHING_PROVIDER_REGISTRY,
    DouyinOAuthService,
    PublicationsService,
    PublishExecutionService,
  ],
})
export class PublishingModule {}
