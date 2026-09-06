import { api } from "./api";
import type { MarketImportKind, MarketImportPreview, MarketResearchRecord } from "./market-research.types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export function listMarketResearch(accessToken: string, projectId: string) {
  return api<MarketResearchRecord[]>(`/projects/${projectId}/market-research`, { accessToken });
}

export function getMarketResearch(accessToken: string, id: string) {
  return api<MarketResearchRecord>(`/market-research/${id}`, { accessToken });
}

async function parseApi<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!response.ok) {
    throw Object.assign(new Error(data.message || "Request failed"), {
      code: data.code ?? "REQUEST_FAILED",
    });
  }
  return data;
}

export async function previewMarketImport(
  accessToken: string,
  projectId: string,
  input: {
    file: File;
    kind: MarketImportKind;
    productBriefId?: string;
    mapping?: Record<string, string> | null;
    collectedAtOverride?: string;
    origin?: string;
    selectionMethod?: string;
  },
): Promise<MarketImportPreview> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("kind", input.kind);
  if (input.productBriefId) body.append("productBriefId", input.productBriefId);
  if (input.collectedAtOverride) body.append("collectedAtOverride", input.collectedAtOverride);
  if (input.origin) body.append("origin", input.origin);
  if (input.selectionMethod) body.append("selectionMethod", input.selectionMethod);
  if (input.mapping) body.append("mapping", JSON.stringify(input.mapping));
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}/projects/${projectId}/market-research/import/preview`, {
    method: "POST",
    headers,
    body,
    credentials: "include",
  });
  return parseApi<MarketImportPreview>(response);
}

export function confirmMarketImport(
  accessToken: string,
  projectId: string,
  input: {
    idempotencyKey: string;
    kind: MarketImportKind;
    productBriefId?: string;
    collectedAt?: string;
    mappingVersion: string;
    fileFingerprint: string;
    normalizedItemsFingerprint?: string;
    format: "CSV" | "XLSX";
    resolvedMapping: Record<string, string>;
    origin?: string;
    selectionMethod?: string;
    rows: Array<{ rowNumber: number; cells: Record<string, unknown> }>;
  },
) {
  return api<MarketResearchRecord>(`/projects/${projectId}/market-research/import/confirm`, {
    method: "POST",
    accessToken,
    headers: { "x-idempotency-key": input.idempotencyKey },
    body: JSON.stringify({
      kind: input.kind,
      productBriefId: input.productBriefId,
      collectedAt: input.collectedAt,
      mappingVersion: input.mappingVersion,
      fileFingerprint: input.fileFingerprint,
      normalizedItemsFingerprint: input.normalizedItemsFingerprint,
      format: input.format,
      resolvedMapping: input.resolvedMapping,
      origin: input.origin,
      selectionMethod: input.selectionMethod,
      rows: input.rows,
    }),
  });
}
