import type { ScriptOutput } from '../../agents/definitions/script-generation.types.js';

/**
 * Step 7.5 fixture: Script 含 hook/opening/sections/ending/cta 字段，
 * 但 hook/opening/ending/cta 旁白为空，使 ProductionPlan 恰好 4 个 visual scenes。
 * 禁止走 Account Positioning / Content Planning / Script Agent。
 */
export const REAL_VISUAL_PIPELINE_SCRIPT: ScriptOutput = {
  title: '城市夜色四镜',
  hook: '',
  opening: '',
  sections: [
    {
      sequence: 1,
      narration: '夜色落下时，高楼的灯一盏盏点亮，城市才慢慢露出真正的轮廓。风从街道尽头吹过来。',
      visualSuggestion: '现代中国城市夜景，超高层玻璃幕墙与霓虹，写实摄影，竖屏，无文字无水印',
      subtitle: '夜色落下，灯火点亮城市轮廓',
      duration: 7,
    },
    {
      sequence: 2,
      narration: '雨停之后，路面把霓虹和车灯倒映成一条缓慢流动的河，脚步声变得很轻。',
      visualSuggestion: '雨后湿润街道倒影，霓虹与车灯拉成长曝光光轨，写实摄影，竖屏，无文字无水印',
      subtitle: '雨后路面倒映成流动的河',
      duration: 8,
    },
    {
      sequence: 3,
      narration: '天桥上行人的剪影被灯牌拉长，喧嚣和安静同时出现在这一刻。',
      visualSuggestion: '城市天桥行人剪影，背后巨大灯牌暖光，电影感夜景，竖屏，无文字无水印',
      subtitle: '天桥剪影，喧嚣与安静同时出现',
      duration: 8,
    },
    {
      sequence: 4,
      narration: '江边天际线把暖光铺开，把这一天慢慢收进更深的夜色里。',
      visualSuggestion: '江边城市天际线与暖色灯光倒影，开阔夜景，写实摄影，竖屏，无文字无水印',
      subtitle: '江边天际线把一天收进夜色',
      duration: 7,
    },
  ],
  ending: '',
  cta: '',
  totalDuration: 30,
  estimatedWordCount: 128,
  voiceStyle: '冷静、中速、不鸡血',
  visualStyle: '电影感夜景，写实摄影，竖屏构图，无文字无水印',
  productionNotes: ['fixture-only', 'no-agent'],
};
