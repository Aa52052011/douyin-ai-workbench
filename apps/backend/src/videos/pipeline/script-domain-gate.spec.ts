import { describe, expect, it } from 'vitest';
import { isScriptDomainMismatch } from './script-domain-gate.js';

describe('script domain gate', () => {
  it('blocks workplace copy against a coffee-store project context', () => {
    expect(
      isScriptDomainMismatch(
        {
          title: '15秒沟通清单脚本',
          hook: '新人最容易踩的坑，不是不会说话，是开口太晚。',
          cta: '评论区留下你这周要改的一件事。',
          sections: [{ narration: '用清单把职场沟通拆成动作', subtitle: '第1步' }],
        },
        '街角手冲咖啡 到店转化',
      ),
    ).toBe(true);
  });

  it('allows coffee copy for a coffee-store project', () => {
    expect(
      isScriptDomainMismatch(
        {
          title: '15秒手冲到店脚本',
          hook: '手冲不好喝，常常不是豆子的问题。',
          cta: '下班路过就来店里坐坐。',
          sections: [{ narration: '把这杯手冲的风味和到店理由讲明白', subtitle: '周末到店' }],
        },
        '街角手冲咖啡 到店转化',
      ),
    ).toBe(false);
  });

  it('does not block workplace copy when the project is not a local-offer coffee context', () => {
    expect(
      isScriptDomainMismatch(
        {
          title: '15秒沟通清单脚本',
          hook: '新人最容易踩的坑',
          cta: '评论区留下你这周要改的一件事。',
          sections: [{ narration: '职场沟通清单', subtitle: '第1步' }],
        },
        '职场成长账号',
      ),
    ).toBe(false);
  });
});
