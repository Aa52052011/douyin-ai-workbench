export const PUBLICATION_TITLE_MAX = 200;
export const PUBLICATION_URL_MAX = 2048;
export const PUBLICATION_WORK_ID_MAX = 256;

export type PublicationRecord = {
  id: string;
  videoId?: string;
  projectId?: string;
  title?: string;
  status: string;
  publishedAt?: string | null;
  registeredAt?: string | null;
  productionArtifactId?: string | null;
  sourceVideoTitle?: string | null;
  verificationStatus?: string | null;
  externalPostId?: string | null;
  externalUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

export type PublicationCompleteForm = {
  externalUrl: string;
  externalPostId: string;
};

export type PublicationView = {
  title: string;
  statusLabel: string;
  sourceVideoTitle: string;
  publishedAtLabel: string;
  createdAtLabel: string;
  externalUrl: string;
  externalPostId: string;
  failureMessage: string;
};

export type PublicationHistoryItemView = {
  title: string;
  sourceVideoTitle: string;
  statusLabel: string;
  publishedAtLabel: string;
  externalUrl: string;
  createdAtLabel: string;
  readable: boolean;
};

export const PUBLICATION_RAW_CONTRACT_TERMS = [
  "PublicationRecord",
  "PlatformSecret",
  "ProviderRegistry",
  "OAuth",
  "sourceJobId",
  "platformAccount",
  "providerResponseMetadata",
  "retryClass",
] as const;
