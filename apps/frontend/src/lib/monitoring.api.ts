import { api } from "./api";

export type PublishedPostRecord = {
  id: string;
  title?: string | null;
  projectId?: string | null;
  publicationId?: string | null;
  platformPostId?: string | null;
  platformUrl?: string | null;
  publishedAt?: string | null;
  productionArtifactId?: string | null;
  monitoringStatus?: string;
  analysisStatus?: string;
  updatedAt?: string;
  latestMetrics?: {
    playCount?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
    capturedAt?: string;
  } | null;
};

export function listMonitoringPosts(accessToken: string) {
  return api<{ items: PublishedPostRecord[] }>("/monitoring/posts", { accessToken });
}
