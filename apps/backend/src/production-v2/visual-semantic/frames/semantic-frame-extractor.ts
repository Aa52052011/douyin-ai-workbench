import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from '../../../media/ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs } from '../../../media/ffmpeg/ffprobe.js';
import { runChildProcess } from '../../../media/ffmpeg/run-process.js';
import { parseAnalyzerFfprobeJson } from '../../visual/parse-analyzer-ffprobe.js';
import { FRAME_ANALYSIS_CONFIG } from '../../visual/frame/frame-analysis-config.js';
import { FrameSamplerService, type ExtractRunner } from '../../visual/frame/frame-sampler.service.js';
import { lumaSimilarity, type LumaFrame } from '../../visual/frame/luma-stats.js';
import { SEMANTIC_FRAME_CONFIG, semanticSize } from './semantic-frame-config.js';
import { SEMANTIC_FRAME_ERROR, SEMANTIC_FRAME_WARNING, type SemanticFrameErrorCode, type SemanticFrameWarningCode } from './semantic-frame-errors.js';
import { selectSemanticFrames } from './select-semantic-frames.js';
import type {
  ExtractedSemanticFrame,
  SemanticFramePrepInput,
  SemanticFramePreparationResult,
  SemanticFrameSelectionPlan,
} from './semantic-frame.types.js';
import type { SemanticFrameInput, VisualSemanticAnalysisRequest } from '../contracts/provider-runtime.types.js';
import { VISUAL_SEMANTIC_BASE_PROMPT_VERSION, VISUAL_SEMANTIC_PROVIDER_REQUEST_SCHEMA } from '../contracts/versions.js';

export type SemanticExtractRunner = ExtractRunner;

function nearestSampleHint(facts: SemanticFramePrepInput['facts'], timestampMs: number | undefined): SemanticFrameWarningCode[] {
  const samples = facts?.frameSamplesSummary ?? [];
  if (!samples.length || timestampMs === undefined) {
    return [];
  }
  const nearest = samples.reduce((best, sample) =>
    Math.abs(sample.timestampMs - timestampMs) < Math.abs(best.timestampMs - timestampMs) ? sample : best,
  );
  const hints: SemanticFrameWarningCode[] = [];
  if ((nearest.sharpnessProxy ?? 99) < FRAME_ANALYSIS_CONFIG.lowSharpnessProxy) {
    hints.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_LOW_SHARPNESS_HINT);
  }
  if ((nearest.averageLuma ?? 128) < FRAME_ANALYSIS_CONFIG.darkMedianCandidate) {
    hints.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_DARK_HINT);
  }
  return hints;
}

export async function probeActualDimensions(filePath: string, run: SemanticExtractRunner = runChildProcess): Promise<{ width: number; height: number; durationMs?: number }> {
  const probed = await run(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 15_000 });
  const parsed = parseAnalyzerFfprobeJson(probed.stdout);
  if (!parsed.ok) {
    throw new Error(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_INVALID_OUTPUT);
  }
  return {
    width: parsed.width,
    height: parsed.height,
    durationMs: parsed.durationSec !== undefined ? Math.round(parsed.durationSec * 1000) : undefined,
  };
}

function mapTimeout(error: unknown): SemanticFrameErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out/i.test(message)) {
    return SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_TIMEOUT;
  }
  return SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_DECODE_FAILED;
}

export class SemanticFrameExtractor {
  constructor(
    readonly run: SemanticExtractRunner = runChildProcess,
    private readonly sampler: FrameSamplerService = new FrameSamplerService(run),
  ) {}

  async extractJpeg(input: {
    filePath: string;
    timestampMs: number;
    width: number;
    height: number;
    outPath: string;
    timeoutMs: number;
  }): Promise<void> {
    const seconds = Math.max(0, input.timestampMs) / 1000;
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-an',
      '-ss',
      seconds.toFixed(3),
      '-i',
      input.filePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${input.width}:${input.height}:flags=lanczos`,
      '-q:v',
      String(SEMANTIC_FRAME_CONFIG.jpegQuality),
      input.outPath,
    ];
    await this.run(ffmpegBin(), args, { timeoutMs: input.timeoutMs });
  }

  async lumaThumb(filePath: string, workDir: string, id: string, width: number, height: number): Promise<LumaFrame> {
    return this.sampler.extractLumaFrame({
      filePath,
      timestampMs: 0,
      sourceWidth: width,
      sourceHeight: height,
      workDir,
      sampleId: id,
    });
  }
}

export type SemanticFrameScope = {
  resolve: (frameId: string) => string;
};

function publicRef(frameId: string): { kind: 'LOCAL_REF'; reference: string } {
  return { kind: 'LOCAL_REF', reference: frameId };
}

export function buildSemanticFrameInputs(frames: ExtractedSemanticFrame[]): SemanticFrameInput[] {
  return frames
    .filter((f) => f.extractionStatus === 'OK' && !f.excludedFromProvider)
    .map((f) => ({
      frameId: f.frameId,
      timestampMs: f.timestampMs,
      width: f.width,
      height: f.height,
      mediaRef: publicRef(f.frameId),
      selectionReason: f.reasons,
    }));
}

export function buildProviderRequestDraft(input: {
  requestId: string;
  assetId: string;
  mediaKind: 'IMAGE' | 'VIDEO';
  frames: ExtractedSemanticFrame[];
  durationMs?: number;
  contentHash?: string;
}): VisualSemanticAnalysisRequest {
  const frames = buildSemanticFrameInputs(input.frames);
  return {
    requestId: input.requestId,
    assetId: input.assetId,
    contentHash: input.contentHash,
    mediaKind: input.mediaKind,
    analysisMode: input.mediaKind === 'IMAGE' ? 'IMAGE_SINGLE' : 'VIDEO_FRAME_SET',
    frames,
    taskModules: ['UI_STRUCTURE'],
    schemaVersion: VISUAL_SEMANTIC_PROVIDER_REQUEST_SCHEMA,
    promptVersion: VISUAL_SEMANTIC_BASE_PROMPT_VERSION,
    durationMs: input.durationMs,
  };
}

export async function withSemanticFrames<T>(
  input: SemanticFramePrepInput,
  callback: (prep: SemanticFramePreparationResult, scope: SemanticFrameScope) => Promise<T>,
  deps: { extractor?: SemanticFrameExtractor; run?: SemanticExtractRunner } = {},
): Promise<T> {
  const extractor = deps.extractor ?? new SemanticFrameExtractor(deps.run ?? runChildProcess);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'acf-semantic-frame-'));
  const pathById = new Map<string, string>();
  try {
    const prep = await prepareSemanticFrames(input, extractor, dir, pathById);
    return await callback(prep, {
      resolve: (frameId) => {
        const found = pathById.get(frameId);
        if (!found) {
          throw new Error(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_INSUFFICIENT);
        }
        return found;
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function prepareSemanticFrames(
  input: SemanticFramePrepInput,
  extractor: SemanticFrameExtractor,
  workDir: string,
  pathById: Map<string, string>,
): Promise<SemanticFramePreparationResult> {
  const t0 = Date.now();
  const errors: SemanticFrameErrorCode[] = [];
  const warnings: SemanticFrameWarningCode[] = [];
  let actual = { width: input.sourceWidth ?? input.facts?.metadata.width ?? 0, height: input.sourceHeight ?? input.facts?.metadata.height ?? 0, durationMs: input.durationMs ?? input.facts?.metadata.durationMs };
  try {
    const probed = await probeActualDimensions(input.mediaPath, extractor.run);
    actual = {
      width: probed.width,
      height: probed.height,
      durationMs: input.mediaKind === 'VIDEO' ? (input.durationMs ?? input.facts?.metadata.durationMs ?? probed.durationMs) : undefined,
    };
  } catch {
    if (actual.width <= 1 || actual.height <= 1) {
      errors.push(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_INVALID_OUTPUT);
    }
  }

  const selected = selectSemanticFrames({
    assetId: input.assetId,
    mediaKind: input.mediaKind,
    facts: input.facts,
    durationMs: actual.durationMs,
    manualTimestampsMs: input.manualTimestampsMs,
  });
  const selectionMs = Date.now() - t0;
  if (selected.invalidManual) {
    errors.push(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_INVALID_TIMESTAMP);
  }
  warnings.push(...selected.plan.warnings);
  if (selected.error) {
    errors.push(selected.error);
    return {
      status: 'FAILED',
      selectionPlan: selected.plan,
      extractedFrames: [],
      providerReadyFrames: [],
      excludedFrames: [],
      warnings,
      errors,
      timing: { selectionMs, extractionMs: 0, dedupMs: 0, totalMs: Date.now() - t0 },
      versions: { selection: 'semantic.frame-selection:v1', extract: 'semantic.frame-extract:v1' },
    };
  }

  const size = semanticSize(actual.width, actual.height);
  const extracted: ExtractedSemanticFrame[] = [];
  const extractStart = Date.now();
  const overallDeadline = extractStart + SEMANTIC_FRAME_CONFIG.overallExtractTimeoutMs;
  const planned = selected.plan.selectedFrames;
  const toExtract =
    input.extractFrameIds && input.extractFrameIds.length > 0
      ? planned.filter((frame) => input.extractFrameIds!.includes(frame.frameId))
      : planned;

  for (const frame of toExtract) {
    const remaining = overallDeadline - Date.now();
    if (remaining <= 0) {
      extracted.push(failedExtract(frame, selected.plan, [SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_BUDGET_TRIMMED]));
      errors.push(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_TIMEOUT);
      continue;
    }
    const fileName = `${frame.frameId.replace(/[^a-z0-9:-]/gi, '_')}.jpg`;
    const outPath = path.join(workDir, fileName);
    let timestamp = frame.timestampMs ?? 0;
    let ok = false;
    const frameWarnings: SemanticFrameWarningCode[] = nearestSampleHint(input.facts, timestamp);
    for (let attempt = 0; attempt <= SEMANTIC_FRAME_CONFIG.maxDecodeRetries; attempt += 1) {
      try {
        await extractor.extractJpeg({
          filePath: input.mediaPath,
          timestampMs: timestamp,
          width: size.width,
          height: size.height,
          outPath,
          timeoutMs: Math.min(SEMANTIC_FRAME_CONFIG.extractTimeoutMs, remaining),
        });
        const info = await stat(outPath);
        if (info.size <= 0) {
          throw new Error(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_INVALID_OUTPUT);
        }
        ok = true;
        break;
      } catch (error) {
        const code = mapTimeout(error);
        if (attempt < SEMANTIC_FRAME_CONFIG.maxDecodeRetries && actual.durationMs) {
          const next = timestamp + SEMANTIC_FRAME_CONFIG.retryOffsetMs;
          if (next < actual.durationMs) {
            timestamp = next;
            frameWarnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_RETRY_OFFSET);
            continue;
          }
        }
        errors.push(code);
        break;
      }
    }
    if (!ok) {
      extracted.push(failedExtract(frame, selected.plan, frameWarnings));
      continue;
    }
    pathById.set(frame.frameId, outPath);
    extracted.push({
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      actualTimestampMs: timestamp,
      width: size.width,
      height: size.height,
      format: 'jpeg',
      mediaRef: publicRef(frame.frameId),
      reasons: frame.reasons,
      selectionScore: frame.selectionScore,
      extractionStatus: 'OK',
      warnings: frameWarnings,
      quality: { usable: true, warnings: frameWarnings },
    });
  }
  const extractionMs = Date.now() - extractStart;

  const dedupStart = Date.now();
  await markVisualDuplicates(extracted, pathById, extractor, workDir, size, warnings);
  const dedupMs = Date.now() - dedupStart;

  const providerReadyFrames = extracted.filter((f) => f.extractionStatus === 'OK' && !f.excludedFromProvider).slice(0, selected.plan.maxFrameCount);
  const excludedFrames = extracted.filter((f) => f.excludedFromProvider || f.extractionStatus === 'FAILED');
  const okCount = providerReadyFrames.length;
  let status: SemanticFramePreparationResult['status'] = 'READY';
  if (okCount === 0) {
    status = 'FAILED';
    errors.push(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_EXTRACTION_FAILED);
  } else if (extracted.some((f) => f.extractionStatus === 'FAILED')) {
    status = 'PARTIAL';
    errors.push(SEMANTIC_FRAME_ERROR.SEMANTIC_FRAME_PARTIAL);
  }

  return {
    status,
    selectionPlan: selected.plan,
    extractedFrames: extracted,
    providerReadyFrames,
    excludedFrames,
    warnings: [...new Set([...warnings, ...extracted.flatMap((f) => f.warnings)])],
    errors: [...new Set(errors)],
    timing: { selectionMs, extractionMs, dedupMs, totalMs: Date.now() - t0 },
    versions: { selection: 'semantic.frame-selection:v1', extract: 'semantic.frame-extract:v1' },
  };
}

function failedExtract(
  frame: SemanticFrameSelectionPlan['selectedFrames'][number],
  _plan: SemanticFrameSelectionPlan,
  warnings: SemanticFrameWarningCode[],
): ExtractedSemanticFrame {
  return {
    frameId: frame.frameId,
    timestampMs: frame.timestampMs,
    width: 0,
    height: 0,
    format: 'jpeg',
    mediaRef: publicRef(frame.frameId),
    reasons: frame.reasons,
    selectionScore: frame.selectionScore,
    extractionStatus: 'FAILED',
    warnings,
    quality: { usable: false, warnings },
  };
}

async function markVisualDuplicates(
  extracted: ExtractedSemanticFrame[],
  pathById: Map<string, string>,
  extractor: SemanticFrameExtractor,
  workDir: string,
  size: { width: number; height: number },
  warnings: SemanticFrameWarningCode[],
): Promise<void> {
  const ok = extracted.filter((f) => f.extractionStatus === 'OK');
  const thumbs: Array<{ frame: ExtractedSemanticFrame; luma: LumaFrame }> = [];
  const thumbDir = path.join(workDir, 'thumbs');
  await mkdir(thumbDir, { recursive: true });
  for (const frame of ok) {
    const file = pathById.get(frame.frameId);
    if (!file) {
      continue;
    }
    try {
      const luma = await extractor.lumaThumb(file, thumbDir, `${frame.frameId}-thumb`, size.width, size.height);
      thumbs.push({ frame, luma });
    } catch {
      /* quality hint only */
    }
  }
  for (let i = 0; i < thumbs.length; i += 1) {
    for (let j = i + 1; j < thumbs.length; j += 1) {
      const sim = lumaSimilarity(thumbs[i].luma, thumbs[j].luma);
      if (sim >= SEMANTIC_FRAME_CONFIG.visualDedupSimilarity) {
        const drop = thumbs[i].frame.selectionScore >= thumbs[j].frame.selectionScore ? thumbs[j].frame : thumbs[i].frame;
        const keep = drop === thumbs[i].frame ? thumbs[j].frame : thumbs[i].frame;
        drop.excludedFromProvider = true;
        drop.duplicateOfFrameId = keep.frameId;
        drop.warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_DEDUPED);
        warnings.push(SEMANTIC_FRAME_WARNING.SEMANTIC_FRAME_DEDUPED);
      }
    }
  }
}

/** Test helper: copy without exposing caller path in result. */
export async function copyIntoScope(workDir: string, sourcePath: string, name: string): Promise<string> {
  const dest = path.join(workDir, name);
  await copyFile(sourcePath, dest);
  return dest;
}
