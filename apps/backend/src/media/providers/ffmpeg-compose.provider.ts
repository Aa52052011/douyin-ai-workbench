import { Injectable } from '@nestjs/common';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MEDIA_MAX_UPLOAD_BYTES } from '../media.constants.js';
import { detectAudioMime, extensionForAudioMime } from '../audio/audio-format.js';
import {
  assertComposeLimits,
  composeFailed,
  ffmpegBin,
  ffmpegTimeoutMs,
  ffprobeBin,
  parseFps,
  parseResolution,
} from '../ffmpeg/ffmpeg-config.js';
import { allocateSceneDurations, buildFfmpegComposeArgs } from '../ffmpeg/ffmpeg-args.js';
import { isFfmpegAvailable } from '../ffmpeg/ffmpeg-available.js';
import { withFfmpegSlot } from '../ffmpeg/compose-slot.js';
import { buildFfprobeArgs, parseFfprobeJson } from '../ffmpeg/ffprobe.js';
import { runChildProcess } from '../ffmpeg/run-process.js';
import { StorageService } from '../storage/storage.service.js';
import { extensionForSceneImage } from '../visual/image-format.js';
import type { ComposeProvider, ComposeRequest, ComposeResult } from './media-provider.types.js';

@Injectable()
export class FfmpegComposeProvider implements ComposeProvider {
  readonly id = 'ffmpeg-compose';
  readonly capabilities = { compose: true, async: false as const };

  constructor(private readonly storage: StorageService) {}

  async compose(request: ComposeRequest): Promise<ComposeResult> {
    if (!isFfmpegAvailable()) {
      throw composeFailed('Compose provider is unavailable');
    }
    if (!request.scenes?.length || !request.voiceStorageKey || !request.subtitleStorageKey) {
      throw composeFailed();
    }
    const { width, height } = parseResolution(request.resolution);
    const fps = parseFps(request.fps);
    assertComposeLimits({
      sceneCount: request.scenes.length,
      voiceDuration: request.voiceDuration,
    });
    return withFfmpegSlot(() => this.render(request, width, height, fps));
  }

  private async render(
    request: ComposeRequest,
    width: number,
    height: number,
    fps: number,
  ): Promise<ComposeResult> {
    const work = await mkdtemp(path.join(os.tmpdir(), 'acf-ffmpeg-'));
    try {
      const sceneDurations = allocateSceneDurations(
        request.scenes!.map((item) => item.durationBudget),
        request.voiceDuration,
      );
      const scenes = await Promise.all(
        request.scenes!.map(async (scene, index) => {
          const body = await this.storage.get(scene.storageKey);
          const filePath = path.join(work, sceneTempFilename(index, body, scene.mimeType, scene.kind));
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, body);
          return {
            path: filePath,
            duration: sceneDurations[index],
            kind: scene.kind ?? (isVideoMime(scene.mimeType) ? 'video' : 'image'),
            sourceStartSec: scene.sourceStartSec,
            freezePadSec: scene.freezePadSec,
            cropTopRatio: scene.cropTopRatio,
          };
        }),
      );
      const voiceBody = await this.storage.get(request.voiceStorageKey!);
      const voicePath = resolveVoiceTempPath(work, request.voiceMimeType, voiceBody);
      await mkdir(path.dirname(voicePath), { recursive: true });
      await writeFile(voicePath, voiceBody);
      const voiceBytes = voiceBody.byteLength;
      const subtitlePath = path.join(work, 'captions.srt');
      const outputPath = path.join(work, 'output.mp4');
      const subtitleBytes = await this.materialize(request.subtitleStorageKey!, subtitlePath);
      if (voiceBytes > MEDIA_MAX_UPLOAD_BYTES) {
        throw composeFailed();
      }
      assertComposeLimits({
        sceneCount: scenes.length,
        voiceDuration: request.voiceDuration,
        subtitleBytes,
      });
      const args = buildFfmpegComposeArgs({
        scenes,
        voicePath,
        subtitlePath,
        outputPath,
        width,
        height,
        fps,
        voiceDuration: request.voiceDuration,
      });
      await runChildProcess(ffmpegBin(), args, { timeoutMs: ffmpegTimeoutMs() });
      const outputStat = await stat(outputPath);
      if (outputStat.size <= 0) {
        throw composeFailed();
      }
      const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(outputPath), {
        timeoutMs: Math.min(30_000, ffmpegTimeoutMs()),
      });
      const summary = parseFfprobeJson(probed.stdout);
      if (!summary?.hasVideo || !summary.hasAudio || summary.duration <= 0) {
        throw composeFailed();
      }
      const body = await readFile(outputPath);
      const stored = await this.storage.put(request.storageKey, body, { mimeType: 'video/mp4' });
      return {
        storageKey: stored.key,
        duration: Math.max(1, Math.round(summary.duration)),
        width: summary.width ?? width,
        height: summary.height ?? height,
        mimeType: 'video/mp4',
        size: stored.size,
      };
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async materialize(storageKey: string, dest: string): Promise<number> {
    await mkdir(path.dirname(dest), { recursive: true });
    const body = await this.storage.get(storageKey);
    await writeFile(dest, body);
    return body.byteLength;
  }
}

function resolveVoiceTempPath(work: string, mimeType: string | undefined, body: Buffer): string {
  const ext =
    extensionForAudioMime(mimeType) ?? extensionForAudioMime(detectAudioMime(body) ?? undefined) ?? '.wav';
  return path.join(work, `voice${ext}`);
}

export function sceneTempFilename(
  index: number,
  body: Buffer,
  mimeType?: string,
  kind?: 'image' | 'video',
): string {
  const resolved = kind ?? (isVideoMime(mimeType) ? 'video' : 'image');
  if (resolved === 'video') {
    return `scene-${String(index + 1).padStart(3, '0')}.mp4`;
  }
  return `scene-${String(index + 1).padStart(3, '0')}${extensionForSceneImage(body, mimeType)}`;
}

function isVideoMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith('video/'));
}
