import type { AccountPositioningOutput } from './account-positioning.types.js';

export const MOCK_ACCOUNT_POSITIONING_OUTPUT: AccountPositioningOutput = {
  accountPositioning:
    '面向职场新人的实用成长账号，用短视频拆解可执行的职场方法，帮助用户少走弯路。',
  targetAudience: {
    description: '刚进入职场 1-3 年、希望提升表达与工作效率的年轻人',
    demographics: '22-30 岁，一二线城市，白领/应届生',
    interests: ['个人成长', '职场沟通', '时间管理'],
    painPoints: ['不知道从哪里提升', '内容太空无法落地'],
  },
  userPainPoints: ['方法太多不知道怎么选', '看完觉得有道理但用不出来', '缺少持续更新的行动清单'],
  contentNiches: [
    { name: '新人沟通', reason: '痛点集中、转化路径短' },
    { name: '效率工具', reason: '容易出对比和演示内容' },
  ],
  contentPillars: [
    { name: '认知纠偏', description: '拆穿常见职场误区', percentage: 30 },
    { name: '方法演示', description: '给可照做的步骤', percentage: 50 },
    { name: '案例复盘', description: '用真实场景收口', percentage: 20 },
  ],
  differentiation: ['只讲能在本周用上的方法', '每条视频都带检查清单'],
  persona: {
    identity: '靠谱的职场学长',
    tone: '冷静、具体、不鸡血',
    characteristics: ['直接', '结构化', '有边界感'],
  },
  profileBio: '职场 1-3 年｜每周 3 条能照做的方法｜少鸡血，多清单',
  contentFormats: ['口播拆解', '对比演示', '清单卡片'],
  publishingStrategy: {
    frequency: '每周 3 条',
    recommendedLength: '30-45 秒',
    recommendedStyle: '开头抛错法，中间给步骤，结尾给清单',
  },
  initialContentDirections: [
    {
      title: '新人最容易踩的 3 个沟通坑',
      description: '用反例开场，再给替换话术',
      reason: '痛点明确，适合冷启动',
    },
    {
      title: '开会前 5 分钟清单',
      description: '把准备工作做成可复制流程',
      reason: '强行动性，利于收藏',
    },
  ],
};
