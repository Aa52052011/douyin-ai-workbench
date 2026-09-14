import type { QualityCheckpoint, QualityIssueCode, QualityPublicView } from './quality.types.js';

const USER_LABELS: Partial<Record<QualityIssueCode, string>> = {
  SUBTITLE_OVERFLOW_RISK: '已调整字幕',
  SUBTITLE_OUT_OF_RANGE: '已校正字幕时间',
  SUBTITLE_TOO_DENSE: '已整理字幕密度',
  TIMELINE_GAP: '已补齐画面空隙',
  ASSET_MISSING: '已替换失效素材',
  ASSET_REVOKED: '已替换失效素材',
  REFERENCE_ASSET_USED: '已替换不可用素材',
  SHOT_TOO_LONG: '已调整镜头节奏',
  SHOT_TOO_SHORT: '已调整镜头节奏',
  HOOK_NOT_EARLY: '已调整片头节奏',
  OPENING_TOO_STATIC: '已调整开场镜头',
  CTA_MISSING: '已补齐行动号召',
  REPEATED_ASSET: '已替换重复素材',
  MEDIA_CORRUPTED: '已重新合成视频',
  OUTPUT_MISSING: '已重新合成视频',
  DURATION_MISMATCH: '已校正成片时长',
  VOICE_DURATION_MISMATCH: '已校正配音时长',
  AUDIO_STREAM_MISSING: '已补齐配音',
  RESOLUTION_INVALID: '已校正画面规格',
  FPS_INVALID: '已校正帧率',
};

export function toQualityPublicView(checkpoint: QualityCheckpoint | undefined, completed: boolean): QualityPublicView {
  if (!checkpoint?.latestQualityResult && !checkpoint?.qualityDisposition) {
    return {
      statusLabel: '旧版成片',
      autoRepairCount: 0,
      summary: completed ? ['旧版成片'] : [],
      bestAvailable: false,
      completedAt: null,
      legacy: true,
    };
  }
  const repairCount = checkpoint.repairHistory.filter((item) => item.result === 'EXECUTED').length;
  const disposition = checkpoint.qualityDisposition ?? checkpoint.latestQualityResult?.finalDisposition;
  const codes = new Set<string>();
  for (const entry of checkpoint.repairHistory) {
    for (const action of entry.actions) {
      void action;
    }
  }
  const summaries: string[] = [];
  for (const result of checkpoint.qualityChecks) {
    for (const issue of result.issues) {
      if (codes.has(issue.code)) {
        continue;
      }
      const label = USER_LABELS[issue.code];
      if (label && repairCount > 0) {
        codes.add(issue.code);
        summaries.push(label);
      }
    }
  }
  if (disposition === 'BEST_AVAILABLE') {
    return {
      statusLabel: '已生成最佳可用版本',
      autoRepairCount: repairCount,
      summary: summaries.length ? summaries.slice(0, 6) : ['系统已完成自动优化，仍有少量可接受的画面/节奏限制。'],
      bestAvailable: true,
      completedAt: checkpoint.latestQualityResult?.checkedAt ?? null,
    };
  }
  if (disposition === 'BLOCKED') {
    return {
      statusLabel: '自动制作未能完成，请重试或调整素材。',
      autoRepairCount: repairCount,
      summary: [],
      bestAvailable: false,
      completedAt: checkpoint.latestQualityResult?.checkedAt ?? null,
    };
  }
  if (repairCount > 0) {
    return {
      statusLabel: `已自动优化 ${repairCount} 项`,
      autoRepairCount: repairCount,
      summary: summaries.slice(0, 6),
      bestAvailable: false,
      completedAt: checkpoint.latestQualityResult?.checkedAt ?? null,
    };
  }
  return {
    statusLabel: '质量检查已通过',
    autoRepairCount: 0,
    summary: ['质量检查已通过'],
    bestAvailable: false,
    completedAt: checkpoint.latestQualityResult?.checkedAt ?? null,
  };
}
