import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { parseProductBriefPayload } from './product-brief.payload.js';

describe('parseProductBriefPayload', () => {
  it('requires productName, industry and businessGoal', () => {
    expect(() => parseProductBriefPayload({ productName: 'A', industry: '教育' })).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }),
    );
  });

  it('rejects empty strings and keeps optional arrays bounded', () => {
    expect(() =>
      parseProductBriefPayload({ productName: '  ', industry: '教育', businessGoal: '获客' }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
    const parsed = parseProductBriefPayload({
      productName: '  测试产品  ',
      industry: '教育',
      businessGoal: '获客',
      brand: '  ',
      sellingPoints: [' 卖点A ', '', '卖点B'],
    });
    expect(parsed.productName).toBe('测试产品');
    expect(parsed.brand).toBeUndefined();
    expect(parsed.sellingPoints).toEqual(['卖点A', '卖点B']);
  });
});
