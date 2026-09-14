import { DETERMINISTIC_ANALYZER_VERSION, type DeterministicAnalysisStatus, type DeterministicVisualFacts } from '../deterministic-visual.types.js';
import { DeterministicMetadataAnalyzer } from '../deterministic-metadata-analyzer.js';
import { mergeFrameAnalysis, sampleAndStatFrames } from '../frame/sample-and-stat.js';
import { FrameSamplerService } from '../frame/frame-sampler.service.js';
import { FRAME_ANALYSIS_ERROR } from '../frame/frame-analysis-errors.js';
import { buildDeterministicVisualCacheKey, currentCacheVersions, truncateHash } from '../cache/cache-key.js';
import type { VisualAnalysisCacheStore, VisualCacheRecord } from '../cache/cache.types.js';
import { sanitizeFactsForCache } from '../cache/sanitize-facts.js';
import { LocalJsonVisualAnalysisCacheStore, defaultVisualCacheRoot } from '../cache/local-json-visual-analysis-cache-store.js';
import type { DeterministicAnalyzeInput, DeterministicVisualAnalysisResult } from './analyzer.types.js';
import { ANALYZER_MAX_TRANSIENT_RETRIES, DETERMINISTIC_ANALYZER_TIMEOUTS, isTransientCode, stageResult, type AnalysisStageResult } from './retry-policy.js';
import { collectNumericIssues } from './facts-integrity.js';
import { DETERMINISTIC_MEDIA_ERROR } from '../parse-analyzer-ffprobe.js';

export type AnalyzerHooks = {
  metadata?: DeterministicMetadataAnalyzer;
  sampler?: FrameSamplerService;
  cache?: VisualAnalysisCacheStore;
  sampleAndStat?: typeof sampleAndStatFrames;
  now?: () => number;
  log?: (event: string, fields: Record<string, string | number | undefined>) => void;
};

function overlayAssetId(facts: DeterministicVisualFacts, assetId: string, contentHash?: string): DeterministicVisualFacts {
  return { ...facts, assetId, contentHash: contentHash ?? facts.contentHash };
}

function logSafe(
  log: AnalyzerHooks['log'],
  event: string,
  fields: { assetId?: string; cacheStatus?: string; stage?: string; durationMs?: number; hash?: string },
) {
  log?.(event, {
    assetId: fields.assetId,
    cacheStatus: fields.cacheStatus,
    stage: fields.stage,
    durationMs: fields.durationMs,
    hash: truncateHash(fields.hash),
  });
}

export class DeterministicVisualAnalyzerService {
  private readonly metadata: DeterministicMetadataAnalyzer;
  private readonly sampler: FrameSamplerService;
  private readonly cache: VisualAnalysisCacheStore;
  private readonly sampleAndStat: typeof sampleAndStatFrames;
  private readonly now: () => number;
  private readonly log?: AnalyzerHooks['log'];

  constructor(hooks: AnalyzerHooks = {}) {
    this.metadata = hooks.metadata ?? new DeterministicMetadataAnalyzer();
    this.sampler = hooks.sampler ?? new FrameSamplerService();
    this.cache = hooks.cache ?? new LocalJsonVisualAnalysisCacheStore(defaultVisualCacheRoot());
    this.sampleAndStat = hooks.sampleAndStat ?? sampleAndStatFrames;
    this.now = hooks.now ?? Date.now;
    this.log = hooks.log;
  }

  async analyze(input: DeterministicAnalyzeInput): Promise<DeterministicVisualAnalysisResult> {
    const t0 = this.now();
    const warnings: string[] = [];
    const stageResults: AnalysisStageResult[] = [];
    const timing = { totalMs: 0, cacheLookupMs: 0, probeMs: 0, samplingMs: 0, heuristicsMs: 0, cropMs: 0 };
    const overall = input.overallTimeoutMs ?? DETERMINISTIC_ANALYZER_TIMEOUTS.overallMs;
    let cacheStatus: DeterministicVisualAnalysisResult['cacheStatus'] = 'BYPASSED';
    let cacheWriteStatus: DeterministicVisualAnalysisResult['cacheWriteStatus'] = 'SKIPPED';

    const versions = currentCacheVersions();
    const cacheKey = input.contentHash
      ? buildDeterministicVisualCacheKey({ contentHash: input.contentHash, ...versions })
      : undefined;
    if (!input.contentHash) {
      warnings.push('NO_CACHE');
    }

    if (cacheKey && !input.forceReanalyze) {
      const lookupStart = this.now();
      try {
        const got = await this.cache.get(cacheKey);
        timing.cacheLookupMs = this.now() - lookupStart;
        cacheStatus = got.status;
        if (got.status === 'HIT') {
          const facts = overlayAssetId(got.record.facts, input.assetId, input.contentHash);
          facts.status = 'PARTIAL';
          facts.deterministicStatus = facts.deterministicStatus ?? 'READY';
          logSafe(this.log, 'cache_hit', { assetId: input.assetId, cacheStatus: 'HIT', hash: input.contentHash, durationMs: timing.cacheLookupMs });
          return {
            facts,
            deterministicStatus: 'READY',
            cacheStatus: 'HIT',
            cacheWriteStatus: 'SKIPPED',
            stageResults: (facts.completedStages ?? []).map((stage) => stageResult(stage, 'COMPLETED', 0)),
            timing: { ...timing, totalMs: this.now() - t0 },
            warnings,
          };
        }
        if (got.status === 'INVALID') {
          warnings.push('CACHE_INVALID');
        }
      } catch {
        timing.cacheLookupMs = this.now() - lookupStart;
        cacheStatus = 'READ_FAILED';
        warnings.push('CACHE_READ_FAILED');
      }
    } else if (input.forceReanalyze) {
      cacheStatus = 'BYPASSED';
    }

    const metaStart = this.now();
    let facts: DeterministicVisualFacts | undefined;
    if (input.kind === 'IMAGE') {
      if (!input.assetMetadata) {
        return this.fail(t0, timing, stageResults, warnings, cacheStatus, 'INVALID_MEDIA', [
          stageResult('METADATA', 'FAILED', this.now() - metaStart, { errorCode: 'INVALID_MEDIA' }),
        ]);
      }
      const imaged = this.metadata.fromAssetMetadata({
        assetId: input.assetId,
        contentHash: input.contentHash,
        width: input.assetMetadata.width,
        height: input.assetMetadata.height,
        durationMs: input.assetMetadata.durationMs,
        mimeType: input.assetMetadata.mimeType,
        fileSize: input.assetMetadata.fileSize,
      });
      timing.probeMs = this.now() - metaStart;
      if (!imaged.ok) {
        stageResults.push(stageResult('METADATA', 'FAILED', timing.probeMs, { errorCode: imaged.code }));
        return this.fail(t0, timing, stageResults, warnings, cacheStatus, imaged.code);
      }
      facts = imaged.facts;
      stageResults.push(stageResult('METADATA', 'COMPLETED', timing.probeMs));
      stageResults.push(stageResult('GEOMETRY', 'COMPLETED', 0));
    } else {
      if (!input.mediaPath) {
        return this.fail(t0, timing, stageResults, warnings, cacheStatus, DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED, [
          stageResult('METADATA', 'FAILED', 0, { errorCode: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED }),
        ]);
      }
      let probed = await this.metadata.analyzeFile({
        assetId: input.assetId,
        contentHash: input.contentHash,
        mimeType: input.assetMetadata?.mimeType,
        filePath: input.mediaPath,
        timeoutMs: DETERMINISTIC_ANALYZER_TIMEOUTS.metadataMs,
      });
      if (!probed.ok && isTransientCode(probed.code)) {
        probed = await this.metadata.analyzeFile({
          assetId: input.assetId,
          contentHash: input.contentHash,
          mimeType: input.assetMetadata?.mimeType,
          filePath: input.mediaPath,
          timeoutMs: DETERMINISTIC_ANALYZER_TIMEOUTS.metadataMs,
        });
      }
      timing.probeMs = this.now() - metaStart;
      if (!probed.ok) {
        stageResults.push(stageResult('METADATA', 'FAILED', timing.probeMs, { errorCode: probed.code }));
        logSafe(this.log, 'probe_failed', { assetId: input.assetId, stage: 'METADATA', durationMs: timing.probeMs });
        return this.fail(t0, timing, stageResults, warnings, cacheStatus, probed.code);
      }
      facts = probed.facts;
      stageResults.push(stageResult('METADATA', 'COMPLETED', timing.probeMs));
      stageResults.push(stageResult('GEOMETRY', 'COMPLETED', 0));
    }

    if (this.now() - t0 > overall) {
      warnings.push('ANALYSIS_OVERALL_TIMEOUT');
      facts.status = 'PARTIAL';
      facts.deterministicStatus = 'PARTIAL';
      stageResults.push(stageResult('FRAME_SAMPLING', 'SKIPPED', 0, { errorCode: 'PROCESS_TIMEOUT' }));
      return this.finish(t0, timing, facts, 'PARTIAL', cacheStatus, cacheWriteStatus, stageResults, warnings);
    }

    if (!input.mediaPath) {
      facts.status = 'PARTIAL';
      facts.deterministicStatus = 'PARTIAL';
      return this.finish(t0, timing, facts, 'PARTIAL', cacheStatus, cacheWriteStatus, stageResults, warnings);
    }

    const sampleStart = this.now();
    let frames = await this.sampleAndStat({
      metadata: facts.metadata,
      filePath: input.mediaPath,
      sampler: this.sampler,
    });
    if (!frames.ok && ANALYZER_MAX_TRANSIENT_RETRIES > 0 && frames.code === FRAME_ANALYSIS_ERROR.NO_USABLE_FRAME_SAMPLE) {
      // decode-all-fail is non-transient: do not retry
    }
    timing.samplingMs = this.now() - sampleStart;
    timing.heuristicsMs = 0;
    if (frames.ok && !frames.skipped) {
      timing.cropMs = frames.attach.cropComputeMs ?? 0;
      timing.heuristicsMs = frames.attach.motionComputeMs ?? 0;
    }

    if (!frames.ok) {
      warnings.push('FRAME_STAGE_FAILED');
      facts.status = 'PARTIAL';
      facts.deterministicStatus = 'PARTIAL';
      stageResults.push(stageResult('FRAME_SAMPLING', 'FAILED', timing.samplingMs, { errorCode: frames.code }));
      return this.finish(t0, timing, facts, 'PARTIAL', cacheStatus, cacheWriteStatus, stageResults, warnings);
    }
    if (frames.skipped) {
      facts = { ...facts, warnings: [...facts.warnings, ...frames.warnings], status: 'PARTIAL', deterministicStatus: 'PARTIAL' };
      stageResults.push(stageResult('FRAME_SAMPLING', 'SKIPPED', timing.samplingMs, { warnings: frames.warnings }));
      return this.finish(t0, timing, facts, 'PARTIAL', cacheStatus, cacheWriteStatus, stageResults, warnings);
    }

    const cropFailed = frames.warnings.includes('CROP_CANDIDATE_STAGE_FAILED');
    const regionFailed = frames.warnings.includes('REGION_HEURISTIC_STAGE_FAILED');
    const motionFailed = frames.warnings.includes('MOTION_HEURISTIC_STAGE_FAILED');
    facts = mergeFrameAnalysis(facts, frames.attach, frames.warnings);
    facts.status = 'PARTIAL';
    facts.deterministicStatus = cropFailed || regionFailed || motionFailed ? 'PARTIAL' : 'READY';
    stageResults.push(stageResult('FRAME_SAMPLING', 'COMPLETED', timing.samplingMs));
    stageResults.push(stageResult('FRAME_STATS', 'COMPLETED', 0));
    stageResults.push(
      stageResult('BORDER_HEURISTICS', regionFailed ? 'FAILED' : 'COMPLETED', timing.heuristicsMs, {
        errorCode: regionFailed ? 'REGION_HEURISTIC_STAGE_FAILED' : undefined,
      }),
    );
    if (motionFailed) {
      stageResults.push(stageResult('MOTION_HEURISTICS', 'FAILED', timing.heuristicsMs, { errorCode: 'MOTION_HEURISTIC_STAGE_FAILED' }));
    } else if (frames.attach.motionHeuristics && frames.attach.motionHeuristics.skipped !== 'IMAGE') {
      stageResults.push(stageResult('MOTION_HEURISTICS', 'COMPLETED', timing.heuristicsMs));
      stageResults.push(stageResult('SCENE_HEURISTICS', 'COMPLETED', 0));
    } else {
      stageResults.push(stageResult('MOTION_HEURISTICS', 'SKIPPED', 0));
    }
    stageResults.push(
      stageResult('CROP_GEOMETRY_CANDIDATES', cropFailed ? 'FAILED' : 'COMPLETED', timing.cropMs, {
        errorCode: cropFailed ? 'CROP_CANDIDATE_STAGE_FAILED' : undefined,
      }),
    );

    const numericIssues = collectNumericIssues(facts);
    if (numericIssues.length) {
      warnings.push('NUMERIC_FACT_ISSUE');
    }

    if (facts.deterministicStatus === 'READY' && cacheKey && input.contentHash && numericIssues.length === 0) {
      try {
        const record: VisualCacheRecord = {
          schemaVersion: facts.schemaVersion,
          analysisVersion: DETERMINISTIC_ANALYZER_VERSION,
          cacheKey,
          contentHash: input.contentHash,
          createdAt: new Date().toISOString(),
          durationMs: this.now() - t0,
          completedStages: facts.completedStages,
          status: facts.status,
          deterministicStatus: facts.deterministicStatus,
          facts: sanitizeFactsForCache(overlayAssetId(facts, input.assetId, input.contentHash)),
        };
        record.facts.assetId = '';
        await this.cache.set(cacheKey, record);
        cacheWriteStatus = 'WRITTEN';
      } catch {
        cacheWriteStatus = 'FAILED';
        warnings.push('CACHE_WRITE_FAILED');
      }
    }

    logSafe(this.log, 'analyze_done', {
      assetId: input.assetId,
      cacheStatus,
      durationMs: this.now() - t0,
      hash: input.contentHash,
    });
    return this.finish(t0, timing, facts, facts.deterministicStatus ?? 'PARTIAL', cacheStatus, cacheWriteStatus, stageResults, warnings);
  }

  private fail(
    t0: number,
    timing: DeterministicVisualAnalysisResult['timing'],
    stageResults: DeterministicVisualAnalysisResult['stageResults'],
    warnings: string[],
    cacheStatus: DeterministicVisualAnalysisResult['cacheStatus'],
    errorCode: string,
    extraStages?: DeterministicVisualAnalysisResult['stageResults'],
  ): DeterministicVisualAnalysisResult {
    return {
      deterministicStatus: 'FAILED',
      cacheStatus,
      cacheWriteStatus: 'SKIPPED',
      stageResults: extraStages ?? stageResults,
      timing: { ...timing, totalMs: this.now() - t0 },
      warnings,
      errorCode,
    };
  }

  private finish(
    t0: number,
    timing: DeterministicVisualAnalysisResult['timing'],
    facts: DeterministicVisualFacts,
    deterministicStatus: DeterministicAnalysisStatus,
    cacheStatus: DeterministicVisualAnalysisResult['cacheStatus'],
    cacheWriteStatus: DeterministicVisualAnalysisResult['cacheWriteStatus'],
    stageResults: DeterministicVisualAnalysisResult['stageResults'],
    warnings: string[],
  ): DeterministicVisualAnalysisResult {
    facts.deterministicStatus = deterministicStatus;
    facts.status = 'PARTIAL';
    return {
      facts,
      deterministicStatus,
      cacheStatus,
      cacheWriteStatus,
      stageResults,
      timing: { ...timing, totalMs: this.now() - t0 },
      warnings: [...new Set([...warnings, ...facts.warnings])],
    };
  }
}
