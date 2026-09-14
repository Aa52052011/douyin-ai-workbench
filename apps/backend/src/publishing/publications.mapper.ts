import type { PlatformAccount, Publication } from '@prisma/client';
import { readRetryClass } from './publication-status.js';
import type { PublishingRetryClass } from './providers/publishing-provider.types.js';

export type PlatformAccountPublicSummary = {
  id: string;
  platform: string;
  displayName: string;
  status: string;
  externalAccountId: string;
};

export type PublicationPublic = {
  id: string;
  videoId: string | null;
  projectId: string;
  platform: string;
  mode: string;
  status: string;
  title: string;
  description: string;
  hashtags: string[];
  visibility: string;
  platformAccount: PlatformAccountPublicSummary | null;
  publishedAt: Date | null;
  externalPostId: string | null;
  externalUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryClass: PublishingRetryClass | null;
  sourceJobId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicPlatformAccount(account: PlatformAccount): PlatformAccountPublicSummary {
  return {
    id: account.id,
    platform: account.platform,
    displayName: account.displayName,
    status: account.status,
    externalAccountId: account.externalAccountId,
  };
}

export function toPublicPublication(
  publication: Publication,
  account?: PlatformAccount | null,
): PublicationPublic {
  return {
    id: publication.id,
    videoId: publication.videoId,
    projectId: publication.projectId,
    platform: publication.platform,
    mode: publication.mode,
    status: publication.status,
    title: publication.title,
    description: publication.description,
    hashtags: publication.hashtags,
    visibility: publication.visibility,
    platformAccount: account ? toPublicPlatformAccount(account) : null,
    publishedAt: publication.publishedAt,
    externalPostId: publication.externalPostId,
    externalUrl: publication.externalUrl,
    errorCode: publication.errorCode,
    errorMessage: publication.errorMessage,
    retryClass: readRetryClass(publication.providerResponseMetadata) ?? null,
    sourceJobId: publication.sourceJobId,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
  };
}
