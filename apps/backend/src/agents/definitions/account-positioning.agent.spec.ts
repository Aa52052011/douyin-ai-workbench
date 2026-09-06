import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  parseAccountPositioningInput,
  parseModelJson,
  validateAccountPositioningOutput,
} from './account-positioning.agent.js';
import { MOCK_ACCOUNT_POSITIONING_OUTPUT } from './account-positioning.fixture.js';

const validInput = {
  industry: '教育',
  platform: 'douyin',
  accountType: '个人IP',
  goal: '帮助职场新人建立方法论',
};

describe('account.positioning input/output', () => {
  it('accepts a valid payload', () => {
    expect(parseAccountPositioningInput(validInput)).toEqual(validInput);
  });

  it.each(['industry', 'platform', 'accountType', 'goal'] as const)(
    'rejects missing %s',
    (field) => {
      const input = { ...validInput };
      delete input[field];
      expect(() => parseAccountPositioningInput(input)).toThrowError();
      try {
        parseAccountPositioningInput(input);
      } catch (error) {
        expect((error as { code: string }).code).toBe(ErrorCode.AGENT_INVALID_INPUT);
      }
    },
  );

  it('rejects oversized fields and context ids', () => {
    expect(() =>
      parseAccountPositioningInput({ ...validInput, industry: 'x'.repeat(101) }),
    ).toThrowError();
    expect(() => parseAccountPositioningInput({ ...validInput, tenantId: 't' })).toThrowError();
  });

  it('validates structured output and rejects non-JSON', () => {
    expect(validateAccountPositioningOutput(MOCK_ACCOUNT_POSITIONING_OUTPUT).profileBio).toContain(
      '职场',
    );
    expect(() => parseModelJson('not-json')).toThrowError();
    expect(() => validateAccountPositioningOutput({ accountPositioning: 'only' })).toThrowError();
    try {
      parseModelJson('hello');
    } catch (error) {
      expect((error as { code: string }).code).toBe(ErrorCode.AGENT_INVALID_OUTPUT);
    }
  });
});
