import { describe, expect, it } from 'vitest';
import { inferGoalCodeFromText, normalizeBusinessGoal } from './business-goal.js';

describe('business-goal normalize', () => {
  it('maps common Chinese goals', () => {
    expect(normalizeBusinessGoal({ businessGoal: '希望涨粉' }).goalCode).toBe('FOLLOW_GROWTH');
    expect(normalizeBusinessGoal({ businessGoal: '希望获得客户咨询' }).goalCode).toBe('LEAD_GENERATION');
    expect(normalizeBusinessGoal({ businessGoal: '我要更多抖音私信' }).goalCode).toBe('PRIVATE_MESSAGE');
    expect(normalizeBusinessGoal({ businessGoal: '让顾客到店' }).goalCode).toBe('STORE_VISIT');
    expect(normalizeBusinessGoal({ businessGoal: '品牌曝光' }).goalCode).toBe('BRAND_AWARENESS');
  });

  it('distinguishes lead vs private message', () => {
    expect(inferGoalCodeFromText('我要更多客户')).toBe('LEAD_GENERATION');
    expect(inferGoalCodeFromText('我要更多抖音私信')).toBe('PRIVATE_MESSAGE');
  });

  it('keeps unknown text as OTHER with original description', () => {
    const v = normalizeBusinessGoal({ businessGoal: '把本地美甲店做成行业口碑标杆' });
    expect(v.goalCode).toBe('OTHER');
    expect(v.goalDescription).toContain('口碑标杆');
  });

  it('prefers explicit goalCode authority', () => {
    expect(normalizeBusinessGoal({ businessGoal: '希望涨粉', goalCode: 'SALES' }).goalCode).toBe('SALES');
  });
});
