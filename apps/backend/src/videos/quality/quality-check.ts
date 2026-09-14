import { parseResolution } from '../../media/ffmpeg/ffmpeg-config.js';
import { validateEditingTimeline, type EditingTimelineV1 } from '../pipeline/editing-timeline.js';
import { semanticCharCount } from '../pipeline/srt.js';
import { issueFingerprint } from './quality-hash.js';
import {
  DURATION_ABS_TOLERANCE_MS,
  DURATION_REL_TOLERANCE,
  HARD_BLOCK_CODES,
  HOOK_LATE_AFTER_MS,
  MAX_SHOT_DURATION_MS,
  MIN_SHOT_DURATION_MS,
  OPENING_STATIC_MS,
  QUALITY_RULESET_VERSION,
  SUBTITLE_EST_FONT_PX,
  SUBTITLE_OVERFLOW_MAX_CHARS,
  SUBTITLE_OVERFLOW_MAX_LINES,
  type ProductionQualityResult,
  type QualityCheckInput,
  type QualityCheckItem,
  type QualityDisposition,
  type QualityIssue,
  type QualityIssueCode,
  type QualityStatus,
} from './quality.types.js';

const ALLOWED_VIDEO_CODECS = new Set(['h264', 'avc1', 'mock']);
const ALLOWED_AUDIO_CODECS = new Set(['aac', 'mp3', 'pcm_s16le', 'mock']);

export function runDeterministicQualityChecks(input: QualityCheckInput): ProductionQualityResult {
  const started = Date.now();
  const checks: QualityCheckItem[] = [];
  const issues: QualityIssue[] = [];
  const mark = (code: string, passed: boolean) => {
    checks.push({ code, passed });
  };

  mark('output_exists', input.fileExists && input.storageExists);
  if (!input.fileExists || !input.storageExists) {
    issues.push(
      issue('OUTPUT_MISSING', 'TECHNICAL', 'BLOCKING', 'COMPOSE', '成片文件缺失', true, 'RECOMPOSE', {
        fileExists: input.fileExists,
        storageExists: input.storageExists,
      }),
    );
  }

  const mockCompose = (input.composeProvider ?? '').includes('mock');
  const probe = input.probe;
  if (!mockCompose && (input.probeFailed || !probe)) {
    mark('ffprobe', false);
    issues.push(issue('MEDIA_CORRUPTED', 'TECHNICAL', 'BLOCKING', 'COMPOSE', '媒体无法解析', true, 'RECOMPOSE'));
  } else {
    mark('ffprobe', true);
    const effective = probe ?? {
      duration: input.voiceDurationSec,
      hasVideo: true,
      hasAudio: input.voiceExpected,
      width: input.expectedWidth,
      height: input.expectedHeight,
      videoCodec: mockCompose ? 'h264' : undefined,
      audioCodec: mockCompose ? 'aac' : undefined,
      fps: input.expectedFps,
    };
    mark('video_stream', effective.hasVideo);
    if (!effective.hasVideo) {
      issues.push(issue('VIDEO_STREAM_MISSING', 'TECHNICAL', 'BLOCKING', 'COMPOSE', '缺少视频流', true, 'RECOMPOSE'));
    }
    if (input.voiceExpected) {
      mark('audio_stream', effective.hasAudio);
      if (!effective.hasAudio) {
        issues.push(issue('AUDIO_STREAM_MISSING', 'AUDIO', 'BLOCKING', 'VOICE', '缺少音频流', true, 'REGENERATE_VOICE'));
      }
    } else {
      mark('audio_stream', true);
    }
    const codecOk = !effective.videoCodec || ALLOWED_VIDEO_CODECS.has(effective.videoCodec);
    mark('video_codec', codecOk);
    const audioCodecOk = !effective.audioCodec || ALLOWED_AUDIO_CODECS.has(effective.audioCodec);
    mark('audio_codec', audioCodecOk);
    const widthOk = effective.width === input.expectedWidth;
    const heightOk = effective.height === input.expectedHeight;
    mark('resolution', Boolean(widthOk && heightOk));
    if (effective.width && effective.height && (!widthOk || !heightOk)) {
      issues.push(
        issue('RESOLUTION_INVALID', 'TECHNICAL', 'ERROR', 'COMPOSE', '分辨率不符合目标', true, 'RECOMPOSE', {
          width: effective.width,
          height: effective.height,
        }),
      );
    }
    const fps = effective.fps ?? input.expectedFps;
    const fpsOk = Math.abs(fps - input.expectedFps) <= 1.5;
    mark('fps', fpsOk);
    if (!fpsOk) {
      issues.push(issue('FPS_INVALID', 'TECHNICAL', 'ERROR', 'COMPOSE', '帧率异常', true, 'RECOMPOSE', { fps }));
    }
    const outputMs = Math.round((effective.duration || 0) * 1000);
    const timelineMs = input.timelineDurationMs || Math.round(input.voiceDurationSec * 1000);
    const abs = Math.abs(outputMs - timelineMs);
    const rel = timelineMs > 0 ? abs / timelineMs : 0;
    const durationOk = abs <= DURATION_ABS_TOLERANCE_MS || rel <= DURATION_REL_TOLERANCE;
    mark('duration', durationOk);
    if (!durationOk) {
      issues.push(
        issue('DURATION_MISMATCH', 'TECHNICAL', 'ERROR', 'COMPOSE', '成片时长与时间线不一致', true, 'RECOMPOSE', {
          outputMs,
          timelineMs,
        }),
      );
    }
    const voiceAbs = Math.abs(outputMs - Math.round(input.voiceDurationSec * 1000));
    if (input.voiceExpected && voiceAbs > DURATION_ABS_TOLERANCE_MS && voiceAbs / Math.max(1, outputMs) > DURATION_REL_TOLERANCE) {
      issues.push(
        issue('VOICE_DURATION_MISMATCH', 'AUDIO', 'ERROR', 'VOICE', '配音时长与成片不一致', true, 'REGENERATE_VOICE', {
          voiceAbs,
        }),
      );
    }
  }

  if (input.timeline) {
    const timelineIssues = validateEditingTimeline(input.timeline as EditingTimelineV1, input.assets, input.assets[0]?.tenantId);
    mark('timeline_coverage', !timelineIssues.includes('VISUAL_GAP'));
    if (timelineIssues.includes('VISUAL_GAP')) {
      issues.push(issue('TIMELINE_GAP', 'TIMELINE', 'BLOCKING', 'TIMELINE', '画面轨道存在空隙', true, 'REBUILD_TIMELINE'));
    }
    mark('source_range', !timelineIssues.includes('INVALID_SOURCE_RANGE') && !timelineIssues.includes('NEGATIVE_TIME'));
    if (timelineIssues.includes('INVALID_SOURCE_RANGE') || timelineIssues.includes('NEGATIVE_TIME') || timelineIssues.includes('START_AFTER_END')) {
      issues.push(issue('SOURCE_RANGE_INVALID', 'TIMELINE', 'ERROR', 'TIMELINE', '镜头源范围不合法', true, 'REBUILD_TIMELINE'));
    }
    const visual = input.timeline.tracks.visual;
    const first = visual[0];
    if (first && first.startMs > HOOK_LATE_AFTER_MS) {
      issues.push(
        issue('HOOK_NOT_EARLY', 'OPENING', 'WARNING', 'SHOT', '钩子镜头未出现在片头', true, 'ADJUST_SHOT_DURATION', undefined, first.sequence),
      );
    }
    if (first && first.assetType === 'IMAGE' && first.endMs - first.startMs >= OPENING_STATIC_MS) {
      issues.push(
        issue('OPENING_TOO_STATIC', 'OPENING', 'WARNING', 'SHOT', '开场静态镜头过长', true, 'ADJUST_SHOT_DURATION', undefined, first.sequence),
      );
    }
    for (const clip of visual) {
      const span = clip.endMs - clip.startMs;
      if (span > MAX_SHOT_DURATION_MS) {
        issues.push(
          issue('SHOT_TOO_LONG', 'PACING', 'ERROR', 'SHOT', '单镜头过长', true, 'ADJUST_SHOT_DURATION', { span }, clip.sequence, clip.assetId),
        );
      }
      if (span < MIN_SHOT_DURATION_MS) {
        issues.push(
          issue('SHOT_TOO_SHORT', 'PACING', 'WARNING', 'SHOT', '单镜头过短', true, 'ADJUST_SHOT_DURATION', { span }, clip.sequence, clip.assetId),
        );
      }
      const asset = input.assets.find((row) => row.id === clip.assetId);
      if (clip.assetId && !asset) {
        issues.push(
          issue('ASSET_MISSING', 'ASSET_QUALITY', 'BLOCKING', 'SHOT', '镜头素材缺失', true, 'REPLACE_SHOT_ASSET', undefined, clip.sequence, clip.assetId),
        );
      } else if (asset && !asset.exists) {
        issues.push(
          issue('ASSET_MISSING', 'ASSET_QUALITY', 'BLOCKING', 'SHOT', '镜头素材文件不存在', true, 'REPLACE_SHOT_ASSET', undefined, clip.sequence, asset.id),
        );
      }
      if (asset?.referenceOnly || asset?.rightsStatus === 'REFERENCE_ONLY') {
        issues.push(
          issue(
            'REFERENCE_ASSET_USED',
            'ASSET_QUALITY',
            'BLOCKING',
            'SHOT',
            '参考素材进入成片',
            true,
            'REPLACE_SHOT_ASSET',
            undefined,
            clip.sequence,
            asset.id,
          ),
        );
      }
      if (asset && (asset.consentStatus === 'REVOKED' || asset.rightsStatus === 'RESTRICTED' || asset.status === 'REVOKED')) {
        issues.push(
          issue('ASSET_REVOKED', 'ASSET_QUALITY', 'BLOCKING', 'SHOT', '素材已失效', true, 'REPLACE_SHOT_ASSET', undefined, clip.sequence, asset.id),
        );
      }
    }
    for (let i = 1; i < visual.length; i++) {
      if (visual[i]?.assetId && visual[i]?.assetId === visual[i - 1]?.assetId) {
        issues.push(
          issue(
            'REPEATED_ASSET',
            'REPETITION',
            'WARNING',
            'SHOT',
            '连续镜头使用同一素材',
            true,
            'REPLACE_SHOT_ASSET',
            undefined,
            visual[i]!.sequence,
            visual[i]!.assetId,
          ),
        );
      }
    }
    const unique = new Set(visual.map((item) => item.assetId).filter(Boolean));
    if (visual.length >= 4 && unique.size / visual.length < 0.4) {
      issues.push(issue('LOW_ASSET_DIVERSITY', 'REPETITION', 'WARNING', 'GLOBAL', '素材多样性偏低', false));
    }
    if (input.hasCtaInPlan) {
      const cta = visual.some((item) => item.purpose === 'CTA' || /cta|行动/i.test(item.sourceKindLabel ?? ''));
      mark('cta', cta);
      if (!cta) {
        issues.push(issue('CTA_MISSING', 'CTA', 'ERROR', 'TIMELINE', '缺少行动号召段落', true, 'REBUILD_TIMELINE'));
      }
    } else {
      mark('cta', true);
    }
  } else {
    mark('timeline_coverage', false);
    issues.push(issue('TIMELINE_GAP', 'TIMELINE', 'BLOCKING', 'TIMELINE', '缺少时间线', true, 'REBUILD_TIMELINE'));
  }

  const voiceTrack = input.timeline?.tracks.voice[0];
  if (input.voiceExpected && !voiceTrack?.assetId) {
    issues.push(issue('AUDIO_STREAM_MISSING', 'AUDIO', 'BLOCKING', 'VOICE', '配音资产缺失', true, 'REGENERATE_VOICE'));
  }

  const durationSec = (input.timelineDurationMs || Math.round(input.voiceDurationSec * 1000)) / 1000;
  for (const cue of input.subtitleCues) {
    if (cue.start < 0 || cue.end < cue.start || cue.end - cue.start < 0) {
      issues.push(issue('SUBTITLE_OUT_OF_RANGE', 'SUBTITLE', 'ERROR', 'SUBTITLE', '字幕时间不合法', true, 'REBUILD_SUBTITLE'));
    }
    if (cue.end > durationSec + 0.05) {
      issues.push(issue('SUBTITLE_OUT_OF_RANGE', 'SUBTITLE', 'ERROR', 'SUBTITLE', '字幕超出成片时长', true, 'REBUILD_SUBTITLE'));
    }
    if (!cue.text.trim()) {
      issues.push(issue('SUBTITLE_TOO_DENSE', 'SUBTITLE', 'WARNING', 'SUBTITLE', '字幕文本为空', true, 'REBUILD_SUBTITLE'));
    }
    const chars = semanticCharCount(cue.text);
    const estimatedLines = estimateSubtitleLines(cue.text, input.canvasWidth);
    if (chars > SUBTITLE_OVERFLOW_MAX_CHARS || estimatedLines > SUBTITLE_OVERFLOW_MAX_LINES) {
      issues.push(
        issue('SUBTITLE_OVERFLOW_RISK', 'SUBTITLE', 'ERROR', 'SUBTITLE', '字幕可能溢出画面', true, 'REBUILD_SUBTITLE', {
          chars,
          estimatedLines,
        }),
      );
    }
  }
  mark('subtitle_timing', !issues.some((item) => item.code === 'SUBTITLE_OUT_OF_RANGE'));
  mark('subtitle_overflow', !issues.some((item) => item.code === 'SUBTITLE_OVERFLOW_RISK'));

  if (input.contentOverlap) {
    issues.push(issue('LOW_ASSET_DIVERSITY', 'CONTENT_ALIGNMENT', 'WARNING', 'GLOBAL', '近期内容角度高度相似', false));
  }

  const uniqueIssues = dedupeIssues(issues);
  const blockingIssueCount = uniqueIssues.filter((item) => item.severity === 'BLOCKING' || HARD_BLOCK_CODES.includes(item.code)).length;
  const errorCount = uniqueIssues.filter((item) => item.severity === 'ERROR').length;
  const status: QualityStatus = blockingIssueCount > 0 || errorCount > 0 ? 'FAIL' : 'PASS';
  const finalDisposition: QualityDisposition =
    blockingIssueCount > 0 ? 'BLOCKED' : status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    version: QUALITY_RULESET_VERSION,
    status,
    checkedAt: new Date().toISOString(),
    checks,
    issues: uniqueIssues,
    repairableIssueCount: uniqueIssues.filter((item) => item.repairable).length,
    blockingIssueCount,
    attempt: input.attempt,
    finalDisposition: status === 'PASS' ? 'PASS' : finalDisposition,
    qualityInputHash: input.qualityInputHash,
    durationMs: Date.now() - started,
  };
}

export function applyAttemptDisposition(
  result: ProductionQualityResult,
  opts: { attemptsUsed: number; maxAttempts: number; remainingRepairable: boolean },
): ProductionQualityResult {
  const hard = result.issues.some((item) => HARD_BLOCK_CODES.includes(item.code) && item.severity === 'BLOCKING');
  if (result.status === 'PASS') {
    return { ...result, finalDisposition: 'PASS' };
  }
  if (hard) {
    return { ...result, status: 'FAIL', finalDisposition: 'BLOCKED' };
  }
  if (!opts.remainingRepairable || opts.attemptsUsed >= opts.maxAttempts) {
    return { ...result, status: 'BEST_AVAILABLE', finalDisposition: 'BEST_AVAILABLE' };
  }
  return { ...result, status: 'FAIL', finalDisposition: 'BLOCKED' };
}

export function qualityGateErrorResult(hash: string, attempt: number): ProductionQualityResult {
  return {
    version: QUALITY_RULESET_VERSION,
    status: 'FAIL',
    checkedAt: new Date().toISOString(),
    checks: [{ code: 'quality_gate', passed: false }],
    issues: [
      issue('QUALITY_GATE_ERROR', 'TECHNICAL', 'BLOCKING', 'GLOBAL', '质量检查异常', false),
    ],
    repairableIssueCount: 0,
    blockingIssueCount: 1,
    attempt,
    finalDisposition: 'BLOCKED',
    qualityInputHash: hash,
    durationMs: 0,
  };
}

export function canFinalizeDisposition(disposition: QualityDisposition | undefined, hasCheckpoint: boolean): boolean {
  if (!hasCheckpoint) {
    return true;
  }
  return disposition === 'PASS' || disposition === 'BEST_AVAILABLE';
}

export function expectedResolution(resolution: string): { width: number; height: number } {
  return parseResolution(resolution);
}

function estimateSubtitleLines(text: string, canvasWidth: number): number {
  const maxCharsPerLine = Math.max(8, Math.floor((canvasWidth * 0.86) / SUBTITLE_EST_FONT_PX));
  const lines = text.split('\n');
  let total = 0;
  for (const line of lines) {
    const chars = Math.max(1, semanticCharCount(line) || line.length);
    total += Math.ceil(chars / maxCharsPerLine);
  }
  return total;
}

function issue(
  code: QualityIssueCode,
  category: QualityIssue['category'],
  severity: QualityIssue['severity'],
  scope: QualityIssue['scope'],
  message: string,
  repairable: boolean,
  suggestedRepairType?: QualityIssue['suggestedRepairType'],
  evidence?: Record<string, string | number | boolean>,
  shotSequence?: number,
  assetId?: string,
): QualityIssue {
  return {
    code,
    category,
    severity,
    scope,
    message,
    repairable,
    suggestedRepairType,
    deterministic: true,
    evidence,
    shotSequence,
    assetId,
  };
}

function dedupeIssues(issues: QualityIssue[]): QualityIssue[] {
  const seen = new Set<string>();
  const out: QualityIssue[] = [];
  for (const item of issues) {
    const key = issueFingerprint(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}
