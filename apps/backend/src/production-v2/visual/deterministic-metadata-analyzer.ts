import { ffprobeBin } from '../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../media/ffmpeg/run-process.js';
import { classifyOrientation, getAspectRatio } from './geometry/aspect-ratio.js';
import {
  DETERMINISTIC_ANALYZER_VERSION,
  DETERMINISTIC_VISUAL_SCHEMA,
  type DeterministicMediaMetadata,
  type DeterministicVisualFacts,
} from './deterministic-visual.types.js';
import {
  DETERMINISTIC_MEDIA_ERROR,
  parseAnalyzerFfprobeJson,
  type DeterministicMediaErrorCode,
} from './parse-analyzer-ffprobe.js';

export type ProbeRunner = (bin: string, args: string[], opts: { timeoutMs: number }) => Promise<{ stdout: string }>;

export type AnalyzeFileInput = {
  assetId: string;
  contentHash?: string;
  mimeType?: string;
  timeoutMs?: number;
  /** Logical path for ffprobe only; never copied into facts or error messages. */
  filePath: string;
};

export type AssetMetadataInput = {
  assetId: string;
  contentHash?: string;
  width: number;
  height: number;
  durationMs?: number;
  mimeType?: string;
  fileSize?: number;
};

export type MetadataAnalyzeOk = { ok: true; facts: DeterministicVisualFacts };
export type MetadataAnalyzeErr = { ok: false; code: DeterministicMediaErrorCode };
export type MetadataAnalyzeResult = MetadataAnalyzeOk | MetadataAnalyzeErr;

export function buildMediaMetadata(input: {
  width: number;
  height: number;
  durationMs?: number;
  fps?: number;
  frameCount?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
  fileSize?: number;
  mimeType?: string;
}): DeterministicMediaMetadata | undefined {
  const aspect = getAspectRatio(input.width, input.height);
  if (!aspect) {
    return undefined;
  }
  return {
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
    fps: input.fps,
    frameCount: input.frameCount,
    videoCodec: input.videoCodec,
    audioCodec: input.audioCodec,
    hasAudio: input.hasAudio,
    sampleRate: input.sampleRate,
    channels: input.channels,
    aspectRatio: aspect.simplified,
    orientation: classifyOrientation(input.width, input.height),
    fileSize: input.fileSize,
    mimeType: input.mimeType,
  };
}

export function buildB11Facts(input: {
  assetId: string;
  contentHash?: string;
  metadata: DeterministicMediaMetadata;
  warnings?: string[];
}): DeterministicVisualFacts {
  return {
    schemaVersion: DETERMINISTIC_VISUAL_SCHEMA,
    assetId: input.assetId,
    contentHash: input.contentHash,
    metadata: input.metadata,
    analysisVersion: DETERMINISTIC_ANALYZER_VERSION,
    warnings: input.warnings ?? [],
    status: 'PARTIAL',
    completedStages: ['METADATA', 'GEOMETRY'],
  };
}

export class DeterministicMetadataAnalyzer {
  constructor(private readonly probe: ProbeRunner = runChildProcess) {}

  fromAssetMetadata(input: AssetMetadataInput): MetadataAnalyzeResult {
    const metadata = buildMediaMetadata({
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      hasAudio: false,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    });
    if (!metadata) {
      return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.INVALID_MEDIA_DIMENSIONS };
    }
    return {
      ok: true,
      facts: buildB11Facts({
        assetId: input.assetId,
        contentHash: input.contentHash,
        metadata,
        warnings: ['IMAGE_METADATA_FROM_ASSET'],
      }),
    };
  }

  async analyzeFile(input: AnalyzeFileInput): Promise<MetadataAnalyzeResult> {
    let stdout: string;
    try {
      const probed = await this.probe(ffprobeBin(), buildFfprobeArgs(input.filePath), {
        timeoutMs: input.timeoutMs ?? 15_000,
      });
      stdout = probed.stdout;
    } catch {
      return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED };
    }
    const parsed = parseAnalyzerFfprobeJson(stdout);
    if (!parsed.ok) {
      return parsed;
    }
    const durationMs =
      parsed.durationSec != null ? Math.round(parsed.durationSec * 1000) : undefined;
    const metadata = buildMediaMetadata({
      width: parsed.width,
      height: parsed.height,
      durationMs,
      fps: parsed.fps,
      frameCount: parsed.frameCount,
      videoCodec: parsed.videoCodec,
      audioCodec: parsed.audioCodec,
      hasAudio: parsed.hasAudio,
      sampleRate: parsed.sampleRate,
      channels: parsed.channels,
      fileSize: parsed.fileSize,
      mimeType: input.mimeType,
    });
    if (!metadata) {
      return { ok: false, code: DETERMINISTIC_MEDIA_ERROR.INVALID_MEDIA_DIMENSIONS };
    }
    const warnings: string[] = [];
    if (durationMs == null) {
      warnings.push('DURATION_UNAVAILABLE');
    }
    if (parsed.fps == null) {
      warnings.push('FPS_UNAVAILABLE');
    }
    return {
      ok: true,
      facts: buildB11Facts({
        assetId: input.assetId,
        contentHash: input.contentHash,
        metadata,
        warnings,
      }),
    };
  }
}
