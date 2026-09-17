import { describe, expect, it } from 'vitest';
import { parseMiniMaxSubtitlePayload } from './minimax-tts-subtitles.js';

describe('parseMiniMaxSubtitlePayload', () => {
  it('parses sentence timestamps in milliseconds', () => {
    const cues = parseMiniMaxSubtitlePayload([
      { text: '你好。', time_begin: 0, time_end: 800 },
      { text: '测试。', time_begin: 800, time_end: 1600 },
    ]);
    expect(cues).toEqual([
      { text: '你好。', start: 0, end: 0.8 },
      { text: '测试。', start: 0.8, end: 1.6 },
    ]);
  });

  it('parses nested utterances', () => {
    const cues = parseMiniMaxSubtitlePayload({
      utterances: [{ text: '一句', start_time: 120, end_time: 900 }],
    });
    expect(cues).toHaveLength(1);
    expect(cues[0]?.start).toBe(0.12);
  });
});
