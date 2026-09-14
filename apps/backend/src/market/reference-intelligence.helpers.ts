/**
 * Deterministic helpers for Reference Intelligence (no network / no binary).
 */
import { createHash } from 'node:crypto';
import {
  IMITATION_RISK_CODES,
  REFERENCE_ANALYSIS_OUTPUT_VERSION,
  REFERENCE_CONTEXT_LIMITS,
  REFERENCE_FORBIDDEN_COPY_KEYS,
  REFERENCE_PATTERN_TYPES,
  type ImitationRiskCode,
  type ImitationRiskItem,
  type ReferenceAnalysisAgentInput,
  type ReferenceAnalysisOutputV1,
  type ReferencePatternItem,
  type ReferencePatternType,
} from './reference-intelligence.types.js';

export const PATTERN_TYPE_LABELS: Record<ReferencePatternType, string> = {
  HOOK: '开头 Hook',
  NARRATIVE: '叙事结构',
  PACING: '节奏',
  SHOT_STRUCTURE: '镜头结构',
  SUBTITLE_STYLE: '字幕风格',
  VISUAL_STYLE: '画面风格',
  CTA: '行动号召',
  EMOTION: '情绪基调',
  FORMAT: '内容形式',
  ANGLE: '内容角度',
  DURATION: '时长结构',
  CONTENT_FLOW: '内容流程',
};

export const IMITATION_RISK_LABELS: Record<ImitationRiskCode, string> = {
  TOO_CLOSE_TO_ORIGINAL: '过于接近原作表达',
  DIRECT_TEXT_COPY: '直接复制文案风险',
  DIRECT_SHOT_COPY: '直接复制镜头风险',
  THIRD_PARTY_FACE: '第三方人脸风险',
  THIRD_PARTY_VOICE: '第三方声音风险',
  UNAUTHORIZED_MEDIA_USE: '未授权素材使用风险',
};

const ORIGINALITY =
  '系统只学习内容结构和表达模式，不直接复制原视频素材或文案。请结合你的产品、目标与定位重新创作。';

export function isReferencePatternType(value: unknown): value is ReferencePatternType {
  return typeof value === 'string' && (REFERENCE_PATTERN_TYPES as readonly string[]).includes(value);
}

export function isImitationRiskCode(value: unknown): value is ImitationRiskCode {
  return typeof value === 'string' && (IMITATION_RISK_CODES as readonly string[]).includes(value);
}

export function normalizePatternKey(type: ReferencePatternType, raw: string): string {
  const normalized = raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 64);
  return `${type}:${normalized || 'generic'}`;
}

export function computeReferenceInputHash(parts: unknown[]): string {
  const stable = JSON.stringify(parts);
  return createHash('sha256').update(stable).digest('hex').slice(0, 40);
}

export function assessAnalysisInput(input: {
  url?: string | null;
  assetId?: string | null;
  title?: string | null;
  note?: string | null;
  reasonForReference?: string | null;
  availableText?: string;
  availableTranscript?: string;
  availableDescription?: string;
  assetHasUsefulMeta?: boolean;
}): { sufficient: boolean; reason?: string } {
  const textBits = [
    input.title,
    input.note,
    input.reasonForReference,
    input.availableText,
    input.availableTranscript,
    input.availableDescription,
  ]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  if (textBits.some((t) => t.length >= 8)) {
    return { sufficient: true };
  }
  if (input.assetId && input.assetHasUsefulMeta) {
    return { sufficient: true };
  }
  if (input.assetId && textBits.length > 0) {
    return { sufficient: true };
  }
  if (input.url && !input.assetId && textBits.length === 0) {
    return {
      sufficient: false,
      reason: 'ANALYSIS_INPUT_INSUFFICIENT',
    };
  }
  if (!input.assetId && textBits.length === 0) {
    return { sufficient: false, reason: 'ANALYSIS_INPUT_INSUFFICIENT' };
  }
  return { sufficient: false, reason: 'ANALYSIS_INPUT_INSUFFICIENT' };
}

export function stripForbiddenCopyFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbiddenCopyFields);
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if ((REFERENCE_FORBIDDEN_COPY_KEYS as readonly string[]).includes(k)) continue;
    out[k] = stripForbiddenCopyFields(v);
  }
  return out;
}

export function looksLikeDirectQuote(summary: string, sourceText: string): boolean {
  const s = summary.trim();
  const src = sourceText.trim();
  if (s.length < 8 || src.length < 8) return false;
  if (src.includes(s) && s.length >= 8) return true;
  const window = Math.min(12, s.length);
  for (let i = 0; i <= s.length - window; i += 1) {
    const chunk = s.slice(i, i + window);
    if (chunk.length >= 8 && src.includes(chunk)) return true;
  }
  return false;
}

export function postprocessReferenceAnalysis(
  raw: ReferenceAnalysisOutputV1,
  sourceText: string,
): ReferenceAnalysisOutputV1 {
  const cleaned = stripForbiddenCopyFields(raw) as ReferenceAnalysisOutputV1;
  const risks = [...(cleaned.imitationRisks ?? [])];
  const patterns: ReferencePatternItem[] = [];
  for (const p of cleaned.reusablePatterns ?? []) {
    if (!isReferencePatternType(p.patternType)) continue;
    const summary = String(p.summary ?? '').trim().slice(0, REFERENCE_CONTEXT_LIMITS.maxSummaryChars);
    if (!summary) continue;
    if (looksLikeDirectQuote(summary, sourceText)) {
      risks.push({
        code: 'DIRECT_TEXT_COPY',
        summary: '检测到疑似原文复述，已从可复用模式中移除',
      });
      continue;
    }
    patterns.push({
      patternType: p.patternType,
      key: normalizePatternKey(p.patternType, p.key || summary),
      summary,
      confidence: p.confidence === 'HIGH' || p.confidence === 'LOW' ? p.confidence : 'MEDIUM',
    });
  }

  const uniqueRisks = dedupeRisks(risks);
  return {
    version: REFERENCE_ANALYSIS_OUTPUT_VERSION,
    referenceSummary: String(cleaned.referenceSummary ?? '').trim().slice(0, 280) || '结构参考摘要',
    hookPattern: trimOpt(cleaned.hookPattern),
    narrativePattern: trimOpt(cleaned.narrativePattern),
    pacingPattern: trimOpt(cleaned.pacingPattern),
    shotPattern: trimOpt(cleaned.shotPattern),
    subtitlePattern: trimOpt(cleaned.subtitlePattern),
    visualPattern: trimOpt(cleaned.visualPattern),
    ctaPattern: trimOpt(cleaned.ctaPattern),
    emotionalTone: trimOpt(cleaned.emotionalTone),
    formatPattern: trimOpt(cleaned.formatPattern),
    durationPattern: trimOpt(cleaned.durationPattern),
    anglePattern: trimOpt(cleaned.anglePattern),
    reusablePatterns: patterns.slice(0, 12),
    imitationRisks: uniqueRisks.slice(0, 8),
    productionNotes: (cleaned.productionNotes ?? [])
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 160))
      .slice(0, 8),
    originalityGuidance: ORIGINALITY,
  };
}

function dedupeRisks(risks: ImitationRiskItem[]): ImitationRiskItem[] {
  const seen = new Set<string>();
  const out: ImitationRiskItem[] = [];
  for (const r of risks) {
    if (!isImitationRiskCode(r.code)) continue;
    const key = `${r.code}:${r.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code: r.code, summary: String(r.summary).trim().slice(0, 160) });
  }
  return out;
}

function trimOpt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().slice(0, REFERENCE_CONTEXT_LIMITS.maxSummaryChars);
  return t || undefined;
}

/**
 * Deterministic analysis from user text + metadata (no LLM / no network).
 */
export function buildDeterministicReferenceAnalysis(
  input: ReferenceAnalysisAgentInput,
): ReferenceAnalysisOutputV1 {
  const text = [
    input.title,
    input.userNote,
    input.reasonForReference,
    input.availableText,
    input.availableTranscript,
    input.availableDescription,
  ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join('\n');

  const lower = text.toLowerCase();
  const patterns: ReferencePatternItem[] = [];
  const fieldPatterns: Partial<
    Record<
      | 'hookPattern'
      | 'narrativePattern'
      | 'pacingPattern'
      | 'shotPattern'
      | 'subtitlePattern'
      | 'visualPattern'
      | 'ctaPattern'
      | 'emotionalTone'
      | 'formatPattern'
      | 'durationPattern'
      | 'anglePattern',
      string
    >
  > = {};

  const push = (type: ReferencePatternType, summary: string, field?: keyof typeof fieldPatterns) => {
    const item: ReferencePatternItem = {
      patternType: type,
      key: normalizePatternKey(type, summary),
      summary: summary.slice(0, REFERENCE_CONTEXT_LIMITS.maxSummaryChars),
      confidence: text.length >= 40 ? 'MEDIUM' : 'LOW',
    };
    patterns.push(item);
    if (field) fieldPatterns[field] = item.summary;
  };

  if (/提问|问句|你还|为什么|是不是|有没有/.test(text)) {
    push('HOOK', '以提问/痛点问题开场，快速制造冲突', 'hookPattern');
  } else if (/痛点|困扰|踩坑|误区/.test(text)) {
    push('HOOK', '先抛痛点或误区，再进入主题', 'hookPattern');
  } else {
    push('HOOK', '前 1–3 秒建立主题张力后再展开', 'hookPattern');
  }

  if (/痛点.*方案|误区.*解决|问题.*方法|流程|步骤/.test(text) || /→|->|然后|接着/.test(text)) {
    push('NARRATIVE', '痛点/误区 → 解释 → 解决方案 → CTA', 'narrativePattern');
    push('CONTENT_FLOW', '按问题引入到行动号召的线性流程推进', undefined);
  } else {
    push('NARRATIVE', '引入 → 核心观点 → 例证/说明 → 收束行动', 'narrativePattern');
  }

  if (/快切|快节奏|前.?3.?秒|密集|信息量大/.test(text)) {
    push('PACING', '前段节奏偏快，尽快给出核心信息', 'pacingPattern');
  } else if (/慢|娓娓|沉浸/.test(text)) {
    push('PACING', '节奏偏稳，适合讲清一条主线', 'pacingPattern');
  } else {
    push('PACING', '开头紧、中段清楚、结尾留行动空间', 'pacingPattern');
  }

  if (/口播|对镜|出镜|人物/.test(text)) {
    push('SHOT_STRUCTURE', '人物口播为主，穿插说明性画面', 'shotPattern');
  } else if (/截图|对比|前后|演示/.test(text)) {
    push('SHOT_STRUCTURE', '对比/演示画面推动信息密度', 'shotPattern');
  } else {
    push('SHOT_STRUCTURE', '口播 + 关键画面交替，服务信息而不是炫技', 'shotPattern');
  }

  if (/字幕|大字|短句|关键词/.test(text)) {
    push('SUBTITLE_STYLE', '短句字幕、关键词高亮、切换较密', 'subtitlePattern');
  } else {
    push('SUBTITLE_STYLE', '字幕短于口播句，便于上屏扫读', 'subtitlePattern');
  }

  if (/私信|评论|留言|咨询|到店|点击/.test(text)) {
    push('CTA', '引导评论/私信/咨询等轻行动', 'ctaPattern');
  } else {
    push('CTA', '结尾给出与账号目标一致的轻行动号召', 'ctaPattern');
  }

  if (/焦虑|紧迫|危机/.test(text)) {
    push('EMOTION', '偏紧迫/焦虑共鸣，随后给出出路', 'emotionalTone');
  } else if (/专业|干货|信任/.test(text)) {
    push('EMOTION', '偏专业可信，强调可执行建议', 'emotionalTone');
  } else {
    push('EMOTION', '保持与账号人设一致的情绪基调', 'emotionalTone');
  }

  push('FORMAT', '短视频口播/讲解型结构参考', 'formatPattern');
  push('ANGLE', input.reasonForReference?.trim() || '围绕用户给定参考意图提炼表达角度', 'anglePattern');

  const duration = input.assetMetadata?.duration;
  if (typeof duration === 'number' && duration > 0) {
    push(
      'DURATION',
      duration <= 20 ? '偏短时长，信息需更集中' : duration <= 45 ? '中等时长，适合一段完整论证' : '偏长时长，需分节控制节奏',
      'durationPattern',
    );
  } else {
    push('DURATION', '按目标时长分配开头/论证/收束比重', 'durationPattern');
  }

  if (/画面|滤镜|色调|竖屏/.test(text) || input.assetMetadata?.type === 'VIDEO') {
    push('VISUAL_STYLE', '竖屏信息流友好，画面服务讲解重点', 'visualPattern');
  }

  const risks: ImitationRiskItem[] = [
    {
      code: 'TOO_CLOSE_TO_ORIGINAL',
      summary: '若照搬原作标题/旁白/分镜将触发原创风险',
    },
  ];
  if (input.sourceType.includes('DOUYIN') || input.platform === 'douyin') {
    risks.push({
      code: 'UNAUTHORIZED_MEDIA_USE',
      summary: '第三方平台素材不可直接用于成片生产',
    });
  }
  if (lower.includes('人脸') || lower.includes('出镜')) {
    risks.push({ code: 'THIRD_PARTY_FACE', summary: '第三方出镜人物不可复用' });
  }
  if (lower.includes('配音') || lower.includes('原声')) {
    risks.push({ code: 'THIRD_PARTY_VOICE', summary: '第三方原声/音色不可复用' });
  }

  const summaryParts = [
    input.title?.trim(),
    input.reasonForReference?.trim(),
    text.slice(0, 80) || '基于用户描述的结构参考',
  ].filter(Boolean);

  return postprocessReferenceAnalysis(
    {
      version: REFERENCE_ANALYSIS_OUTPUT_VERSION,
      referenceSummary: summaryParts[0] ?? '结构参考',
      ...fieldPatterns,
      reusablePatterns: patterns,
      imitationRisks: risks,
      productionNotes: [
        '仅借鉴结构与节奏，不使用原视频画面/声音/文案',
        '结合本账号产品卖点与目标受众重新创作',
        '参考素材保持 referenceOnly，不可进入成片合成',
      ],
      originalityGuidance: ORIGINALITY,
    },
    text,
  );
}

export function mapOutputToPatternRows(output: ReferenceAnalysisOutputV1): Array<{
  patternType: ReferencePatternType;
  key: string;
  summary: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
}> {
  const fromList: Array<{
    patternType: ReferencePatternType;
    key: string;
    summary: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    payload: Record<string, unknown>;
  }> = output.reusablePatterns.map((p) => ({
    patternType: p.patternType,
    key: p.key,
    summary: p.summary,
    confidence: p.confidence,
    payload: { source: 'reusablePatterns' },
  }));
  const extras: Array<{ type: ReferencePatternType; summary?: string }> = [
    { type: 'HOOK', summary: output.hookPattern },
    { type: 'NARRATIVE', summary: output.narrativePattern },
    { type: 'PACING', summary: output.pacingPattern },
    { type: 'SHOT_STRUCTURE', summary: output.shotPattern },
    { type: 'SUBTITLE_STYLE', summary: output.subtitlePattern },
    { type: 'VISUAL_STYLE', summary: output.visualPattern },
    { type: 'CTA', summary: output.ctaPattern },
    { type: 'EMOTION', summary: output.emotionalTone },
    { type: 'FORMAT', summary: output.formatPattern },
    { type: 'DURATION', summary: output.durationPattern },
    { type: 'ANGLE', summary: output.anglePattern },
  ];
  const seen = new Set(fromList.map((p) => p.key));
  for (const e of extras) {
    if (!e.summary) continue;
    const key = normalizePatternKey(e.type, e.summary);
    if (seen.has(key)) continue;
    seen.add(key);
    fromList.push({
      patternType: e.type,
      key,
      summary: e.summary,
      confidence: 'MEDIUM',
      payload: { source: 'field' },
    });
  }
  return fromList.slice(0, 16);
}
