import { api } from "./api";
import { createVideoBody } from "./video.form";
import type { VideoRecord } from "./video.types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export function listVideos(accessToken: string, projectId: string, query?: { scriptId?: string }) {
  const params = new URLSearchParams({ projectId });
  if (query?.scriptId) params.set("scriptId", query.scriptId);
  return api<VideoRecord[]>(`/videos?${params.toString()}`, { accessToken });
}

export function getVideo(accessToken: string, id: string) {
  return api<VideoRecord>(`/videos/${id}`, { accessToken });
}

export function createVideo(accessToken: string, scriptId: string) {
  return api<VideoRecord>("/videos", {
    method: "POST",
    accessToken,
    body: JSON.stringify(createVideoBody(scriptId)),
  });
}

export function retryVideo(accessToken: string, id: string) {
  return api<VideoRecord>(`/videos/${id}/retry`, {
    method: "POST",
    accessToken,
  });
}

export async function exportVideoFile(accessToken: string, id: string): Promise<{ blob: Blob; filename: string }> {
  return fetchBinary(`/videos/${id}/export`, accessToken, "video.mp4");
}

export async function fetchVideoPreview(accessToken: string, contentPath: string): Promise<Blob> {
  const path = contentPath.startsWith("/") ? contentPath : `/${contentPath}`;
  const file = await fetchBinary(path, accessToken, "video.mp4");
  return file.blob;
}

async function fetchBinary(path: string, accessToken: string, fallbackName: string) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    throw Object.assign(new Error(data.message || "Request failed"), {
      code: data.code ?? "REQUEST_FAILED",
    });
  }
  const blob = await response.blob();
  return { blob, filename: filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackName) };
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] || fallback;
}
