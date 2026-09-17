import { describe, expect, it } from 'vitest';
import { MOCK_SCRIPT_OUTPUT } from '../../agents/definitions/script-generation.fixture.js';
import { buildVoiceText } from './production-plan.builder.js';
import { REAL_VISUAL_PIPELINE_SCRIPT } from './real-visual-pipeline.fixture.js';
import {
  buildSubtitleCues,
  cuesFromSpeechMarks,
  normalizeSubtitleSemantics,
  parseSrt,
  renderSrt,
  segmentCanonicalNarration,
  splitNaturalSpeechPhrases,
  subtitleCueStats,
  SUBTITLE_TIME_EPSILON,
} from './srt.js';

function leftover(source: string, other: string): string {
  let rest = source;
  for (const char of other) {
    const index = rest.indexOf(char);
    if (index >= 0) {
      rest = rest.slice(0, index) + rest.slice(index + 1);
    }
  }
  return rest;
}

function expectSemanticMatch(canonical: string, cues: Array<{ text: string }>) {
  const left = normalizeSubtitleSemantics(canonical);
  const right = normalizeSubtitleSemantics(cues.map((item) => item.text).join(''));
  expect(right).toBe(left);
  expect(leftover(left, right)).toBe('');
  expect(leftover(right, left)).toBe('');
}

describe('SRT', () => {
  it('covers canonical narration instead of Script subtitle summaries', () => {
    const canonical = buildVoiceText(REAL_VISUAL_PIPELINE_SCRIPT);
    const cues = buildSubtitleCues(canonical, 25.74);
    expect(cues.length).toBeGreaterThan(4);
    expect(cues.every((item) => item.text.trim().length > 0)).toBe(true);
    expectSemanticMatch(canonical, cues);
    expect(normalizeSubtitleSemantics(cues.map((item) => item.text).join(''))).toContain('风从街道尽头吹过来');
    expect(cues.some((item) => item.text.includes('灯火点亮城市轮廓'))).toBe(false);
  });

  it('does not drop Chinese digits or English letters', () => {
    const canonical = '第1步先改 API。OpenAI 和 2026 年都可以读。';
    const cues = buildSubtitleCues(canonical, 8);
    expectSemanticMatch(canonical, cues);
    const joined = normalizeSubtitleSemantics(cues.map((item) => item.text).join(''));
    expect(joined).toContain('1');
    expect(joined).toContain('API');
    expect(joined).toContain('OpenAI');
    expect(joined).toContain('2026');
  });

  it('segments punctuation deterministically and stays stable', () => {
    const canonical = '雨停之后，路面把霓虹和车灯映得格外清晰。脚步声也慢了下来。';
    const first = segmentCanonicalNarration(canonical);
    const second = segmentCanonicalNarration(canonical);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every((item) => item.trim().length > 0)).toBe(true);
    const cues = buildSubtitleCues(canonical, 10);
    expectSemanticMatch(canonical, cues);
    expect(buildSubtitleCues(canonical, 10)).toEqual(cues);
  });

  it('does not use visual scene count, targetDuration, or durationBudget', () => {
    const canonical = buildVoiceText(REAL_VISUAL_PIPELINE_SCRIPT);
    const a = buildSubtitleCues(canonical, 25.74);
    const b = buildSubtitleCues(canonical, 25.74);
    expect(a.map((item) => item.text)).toEqual(b.map((item) => item.text));
    expect(a.length).not.toBe(4);
  });

  it('uses the floating audio duration instead of rounding to 26', () => {
    const canonical = buildVoiceText(REAL_VISUAL_PIPELINE_SCRIPT);
    const cues = buildSubtitleCues(canonical, 25.74);
    expect(cues[0]?.start).toBe(0);
    expect(cues.at(-1)?.end).toBe(25.74);
    expect(Math.abs((cues.at(-1)?.end ?? 0) - 26)).toBeGreaterThan(0.2);
    for (const [index, cue] of cues.entries()) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(25.74 + SUBTITLE_TIME_EPSILON);
      if (index + 1 < cues.length) {
        expect(cue.end).toBeLessThanOrEqual(cues[index + 1].start + SUBTITLE_TIME_EPSILON);
      }
    }
  });

  it('keeps semantic segmentation when duration changes', () => {
    const canonical = buildVoiceText(REAL_VISUAL_PIPELINE_SCRIPT);
    const short = buildSubtitleCues(canonical, 15);
    const long = buildSubtitleCues(canonical, 45);
    expect(short.map((item) => item.text)).toEqual(long.map((item) => item.text));
    expect(short.at(-1)?.end).toBe(15);
    expect(long.at(-1)?.end).toBe(45);
  });

  it('renders increasing utf-8 cues without leaking secrets', () => {
    const cues = buildSubtitleCues('开头。正文。', 8);
    const body = renderSrt(cues);
    expect(body.startsWith('1\n')).toBe(true);
    expect(Buffer.from(body, 'utf8').toString('utf8')).toBe(body);
    expect(body).not.toContain('sk-');
    expect(body).not.toContain('SECRET');
    const parsed = parseSrt(body);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].start).toBeLessThan(parsed[0].end);
    expectSemanticMatch('开头。正文。', parsed);
  });

  it('returns no cues for empty canonical text', () => {
    expect(buildSubtitleCues('   \n\n  ', 25.74)).toEqual([]);
    expect(buildSubtitleCues('', 25.74)).toEqual([]);
    expect(segmentCanonicalNarration('')).toEqual([]);
  });

  it('handles a single short sentence', () => {
    const cues = buildSubtitleCues('你好。', 3.2);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.text).toContain('你好');
    expect(cues[0]?.start).toBe(0);
    expect(cues[0]?.end).toBe(3.2);
    expectSemanticMatch('你好。', cues);
  });

  it('wraps long text without punctuation and does not split English words', () => {
    const canonical = `这是一段没有任何标点的中文旁白用来验证超长硬切${'字'.repeat(40)}OpenAI remains intact 12345`;
    const cues = buildSubtitleCues(canonical, 40);
    expect(cues.length).toBeGreaterThan(2);
    expect(cues.every((item) => item.text.trim().length > 0)).toBe(true);
    expect(cues.some((item) => /Ope$/.test(item.text) || /^nAI/.test(item.text))).toBe(false);
    expectSemanticMatch(canonical, cues);
  });

  it('covers a 5-10 minute narration without assuming 4 scenes or 10 cues', () => {
    const sentence = '城市入夜以后灯火一层层亮起来，街巷开始有了温度。';
    const canonical = Array.from({ length: 80 }, () => sentence).join('');
    const cues = buildSubtitleCues(canonical, 480);
    expect(cues.length).toBeGreaterThan(20);
    expect(cues.at(-1)?.end).toBe(480);
    expect(cues.every((item) => item.text.trim().length > 0)).toBe(true);
    expectSemanticMatch(canonical, cues);
  });

  it('keeps provider speech marks instead of splitting their time by character count', () => {
    const cues = cuesFromSpeechMarks(
      [
        { text: '第一句完整旁白。', start: 0, end: 1.2 },
        { text: '第二句完整旁白。', start: 1.2, end: 2.4 },
      ],
      2.4,
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]?.end).toBe(1.2);
    expect(cues[1]?.end).toBe(2.4);
    expect(subtitleCueStats(cues, 2.4).overlapCount).toBe(0);
  });

  it('splits a long TTS sentence into natural speech phrases inside the sentence window', () => {
    const source =
      '智能体先提醒顾客真正关心的理由：吃什么、适合谁、什么时候来，以及为什么选这家。';
    const phrases = splitNaturalSpeechPhrases(source);
    expect(phrases.some((item) => item.includes('吃什么'))).toBe(true);
    expect(phrases.some((item) => item.includes('适合谁'))).toBe(true);
    expect(phrases.some((item) => item.includes('吃什么、适合谁'))).toBe(false);
    expect(phrases.some((item) => item.includes('什么时候来'))).toBe(true);
    expect(phrases.some((item) => item.includes('以及为什么选这家'))).toBe(true);
    expect(phrases.some((item) => item.replace(/[：:。！？；;…，,]+$/g, '') === source.replace(/[：:。！？；;…，,]+$/g, ''))).toBe(false);
    const cues = cuesFromSpeechMarks([{ text: source, start: 0, end: 8 }], 8);
    expect(cues.length).toBeGreaterThan(3);
    expect(cues[0]?.start).toBe(0);
    expect(cues.at(-1)?.end).toBe(8);
    expect(cues.every((item) => item.start >= 0 && item.end <= 8)).toBe(true);
    expect(cues.some((item) => item.text.replace(/\n/g, '') === source)).toBe(false);
    expect(subtitleCueStats(cues, 8).overlapCount).toBe(0);
    expect(subtitleCueStats(cues, 8).maxSimultaneousActiveCues).toBe(1);
    expect(subtitleCueStats(cues, 8).multiPhraseCueCount).toBe(0);
    expect(subtitleCueStats(cues, 8).maxCuePhraseCount).toBe(1);
  });

  it('keeps one spoken phrase per cue for enumeration and 和-connected phrases', () => {
    const caseA = splitNaturalSpeechPhrases('先输入门店类型、招牌菜、消费场景、目标顾客');
    expect(caseA.some((item) => item.includes('门店类型'))).toBe(true);
    expect(caseA.some((item) => item.includes('招牌菜'))).toBe(true);
    expect(caseA.some((item) => item.includes('消费场景'))).toBe(true);
    expect(caseA.some((item) => item.includes('目标顾客'))).toBe(true);
    expect(caseA.length).toBeGreaterThanOrEqual(4);
    expect(caseA.some((item) => item.includes('招牌菜') && item.includes('消费场景'))).toBe(false);
    const caseB = splitNaturalSpeechPhrases('家庭聚餐搭配、真实用餐场景和顾客常问问题').map((item) =>
      item.replace(/[，,、。！？；;]+$/g, ''),
    );
    expect(caseB).toEqual(['家庭聚餐搭配', '真实用餐场景', '顾客常问问题']);
    const cues = cuesFromSpeechMarks(
      [{ text: '比如招牌菜制作、午餐怎么点、家庭聚餐搭配、真实用餐场景和顾客常问问题。', start: 0, end: 9 }],
      9,
    );
    expect(cues.some((item) => item.text.includes('家庭聚餐搭配') && item.text.includes('真实用餐场景'))).toBe(false);
    const stats = subtitleCueStats(cues, 9);
    expect(stats.maxSimultaneousActiveCues).toBe(1);
    expect(stats.overlapCount).toBe(0);
    expect(stats.multiPhraseCueCount).toBe(0);
    expect(stats.maxCuePhraseCount).toBe(1);
  });
});
