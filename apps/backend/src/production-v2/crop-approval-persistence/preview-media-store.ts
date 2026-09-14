import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReadStream } from 'node:fs';

export function repoRootFromHere(): string {
  return process.env.CROP_REVIEW_REPO_ROOT
    ? path.resolve(process.env.CROP_REVIEW_REPO_ROOT)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function abstractPreviewRef(sessionId: string, previewVersion: string): string {
  return `review-preview/${sessionId}/${safeSegment(previewVersion)}.mp4`;
}

export function previewStoreFile(input: { tenantId: string; sessionId: string; previewVersion: string; root?: string }): string {
  const root = input.root ?? path.join(repoRootFromHere(), '.local', 'crop-review-previews');
  return path.join(root, safeSegment(input.tenantId), safeSegment(input.sessionId), `${safeSegment(input.previewVersion)}.mp4`);
}

export function resolvePreviewAbsolutePath(input: {
  tenantId: string;
  sessionId: string;
  previewVersion: string;
  assetId: string;
  root?: string;
}): string | null {
  const stored = previewStoreFile(input);
  if (existsSync(stored)) return stored;
  return null;
}

export function writeSyntheticPreviewBytes(input: {
  tenantId: string;
  sessionId: string;
  previewVersion: string;
}): string {
  const file = previewStoreFile(input);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.alloc(64, 1));
  return file;
}

export function previewExists(input: {
  tenantId: string;
  sessionId: string;
  previewVersion: string;
  assetId: string;
}): boolean {
  return Boolean(resolvePreviewAbsolutePath(input));
}

export function openPreviewStream(input: {
  tenantId: string;
  sessionId: string;
  previewVersion: string;
  assetId: string;
}): ReadStream | null {
  const file = resolvePreviewAbsolutePath(input);
  if (!file) return null;
  return createReadStream(file);
}
