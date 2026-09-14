import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRootFromHere } from '../crop-approval-persistence/preview-media-store.js';
import { NARRATION_VISUAL_UNIT_VERSION } from './policy.js';
import type { NarrationVisualUnitV1 } from './types.js';

type FrozenBeat = {
  id: string;
  narration: string;
  expectedDuration: number;
  visualIntent: string;
  requiredEvidence: string;
};

function frozenBeatsPath(): string {
  return path.join(
    repoRootFromHere(),
    '.local',
    'dogfood',
    '30-day',
    'first-3',
    'content-01',
    'production-preflight',
    'script-beats.json',
  );
}

export function loadFrozenScriptBeats(): FrozenBeat[] {
  const file = frozenBeatsPath();
  if (!existsSync(file)) return FROZEN_CONTENT_01_BEATS;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { beats: FrozenBeat[] };
  return raw.beats?.length ? raw.beats : FROZEN_CONTENT_01_BEATS;
}

const FROZEN_CONTENT_01_BEATS: FrozenBeat[] = [
  { id: 'hook', narration: '如果你以为它只是一个会写文案的AI，先看它在一条视频里到底负责哪些环节。', expectedDuration: 5, visualIntent: '工作台顶栏流程', requiredEvidence: '真实工作台导航' },
  { id: 'opening', narration: '我做这个账号，是用自己的抖音内容，测试这套AI短视频工作台能不能减少从选题到成片的来回折腾。', expectedDuration: 6, visualIntent: '产品工作台', requiredEvidence: '真实产品信息页' },
  { id: 'section1', narration: '简单说，它把选题、策略、脚本和制作放在一条流程里。', expectedDuration: 9, visualIntent: '侧栏信息架构', requiredEvidence: '真实侧栏信息架构' },
  { id: 'section2', narration: '我会从真实需求开始，记录系统产出和人工修改。', expectedDuration: 8, visualIntent: '内容面板', requiredEvidence: '需求输入→系统整理' },
  { id: 'section3', narration: '成片还要人工审核口播、字幕和画面，最后手动发布。', expectedDuration: 10, visualIntent: '人工审核', requiredEvidence: '人工门槛 + 非自动发布' },
  { id: 'section4', narration: '每次留下耗时、返工和版本，不预设爆款，也不夸大自动化。', expectedDuration: 10, visualIntent: '中性结构', requiredEvidence: '字幕/B-roll，非 KPI 大屏' },
  { id: 'section5', narration: '接下来只看证据：操作录屏、前后对比和真实成片。', expectedDuration: 8, visualIntent: '真实过程', requiredEvidence: '真实素材中心' },
  { id: 'ending_cta', narration: '好不好用，按结果说。你最想测哪个环节？留言告诉我。', expectedDuration: 5, visualIntent: '下一步入口', requiredEvidence: '真实下一步入口' },
];

function claimsForBeat(id: string): string[] {
  if (id === 'hook') return ['C1', 'C4'];
  if (id === 'opening') return ['C1', 'C3'];
  if (id === 'section1') return ['C2', 'C4'];
  if (id === 'section2') return ['C2', 'C3'];
  if (id === 'section3') return ['C3'];
  if (id === 'section4') return ['C3'];
  if (id === 'section5') return ['C3'];
  if (id === 'ending_cta') return ['C1'];
  return ['C1'];
}

function evidenceForBeat(id: string): string[] {
  if (id === 'hook') return ['PRODUCT_UI', 'NAVIGATION'];
  if (id === 'opening') return ['PRODUCT_UI', 'CONTENT_PANEL'];
  if (id === 'section1') return ['NAVIGATION', 'CONTENT_PANEL', 'TEXT_REGION'];
  if (id === 'section2') return ['CONTENT_PANEL'];
  if (id === 'section3') return ['CONTENT_PANEL', 'NAVIGATION'];
  if (id === 'section4') return ['PRODUCT_UI'];
  if (id === 'section5') return ['PRODUCT_UI'];
  return ['PRODUCT_UI'];
}

export function buildNarrationUnits(input: {
  beats?: FrozenBeat[];
  durationMs: number;
}): NarrationVisualUnitV1[] {
  const beats = input.beats ?? loadFrozenScriptBeats();
  const weight = beats.reduce((sum, beat) => sum + beat.expectedDuration, 0);
  let cursor = 0;
  return beats.map((beat, index) => {
    const span = Math.round((beat.expectedDuration / weight) * input.durationMs);
    const startMs = cursor;
    const endMs = index === beats.length - 1 ? input.durationMs : cursor + span;
    cursor = endMs;
    const preferred =
      beat.id === 'hook' || beat.id === 'ending_cta' || beat.id === 'section4'
        ? ('WIDE_CONTEXT' as const)
        : beat.id === 'section1'
          ? ('DETAIL_READABLE' as const)
          : ('MEDIUM_FOCUS' as const);
    return {
      schemaVersion: NARRATION_VISUAL_UNIT_VERSION,
      unitId: `nu:${beat.id}`,
      startMs,
      endMs,
      textRef: `script-beat:${beat.id}`,
      summary: beat.narration,
      claimRefs: claimsForBeat(beat.id),
      requiredEvidenceRefs: evidenceForBeat(beat.id),
      preferredShotScale: preferred,
      readabilityRequirement: beat.id === 'section1' ? 'CLAIM_CRITICAL_READABLE' : beat.id === 'hook' ? 'IDENTIFIABLE' : 'READABLE',
      contextNeed:
        beat.id === 'hook' ? 'ESTABLISH' : beat.id === 'section4' ? 'RECOVER' : beat.id === 'ending_cta' ? 'CLOSE' : 'MAINTAIN',
      provenance: {
        source: 'FROZEN_SCRIPT_BEATS',
        timingPrecision: 'ESTIMATED_ALIGNMENT',
        frameAccurate: false,
      },
    };
  });
}
