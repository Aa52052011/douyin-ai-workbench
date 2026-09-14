import { describe, expect, it } from 'vitest';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import {
  assertB26AssetId,
  assertB26Cli,
  CONTENT_01_NEW_ASSET_ID,
  findSecretLikeHits,
  OLD_CONTAMINATED_ASSET_FORBIDDEN,
  privacyPreflightScan,
  sanitizeVisibleText,
} from './b2-6-guards.js';
import { validateVisualSemanticModelOutput } from './validate-model-output.js';
import { buildTextDeveloperUserPrompt, buildUiStructureUserPrompt, UI_STRUCTURE_SYSTEM_PROMPT, UI_STRUCTURE_USER_PROMPT } from './ui-structure-prompt.js';

describe('B2-6 real-content guards (offline)', () => {
  it('allows only the Content #1 new recording and blocks the old contaminated asset', () => {
    expect(() => assertB26AssetId(CONTENT_01_NEW_ASSET_ID)).not.toThrow();
    expect(() => assertB26AssetId('c59dfd61-d5fe-4794-9117-e993686710ec')).toThrow(OLD_CONTAMINATED_ASSET_FORBIDDEN);
    expect(() => assertB26AssetId('other')).toThrow('B26_ASSET_NOT_ALLOWED');
    expect(() => assertB26Cli(['--file', 'x.mp4'])).toThrow('B26_REJECTS_EXTERNAL_INPUT');
  });

  it('blocks secret-like strings before provider upload', () => {
    expect(privacyPreflightScan({ label: 'facts', text: 'duration=35107' }).ok).toBe(true);
    expect(privacyPreflightScan({ label: 'env', text: 'Authorization: Bearer eyAAAAAAAAAAAAAAAAAAAA' }).ok).toBe(false);
    expect(findSecretLikeHits('sk-abcdefghijklmnopqrstuv')).toHaveLength(1);
  });

  it('redacts email and secrets in persisted text', () => {
    expect(sanitizeVisibleText('contact abc@example.com').sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitizeVisibleText('sk-abcdefghijklmnopqrstuv').sanitized).toBe('[SECRET_REDACTED]');
  });

  it('accepts full UI vocabulary including chrome and form types', () => {
    const parsed = validateVisualSemanticModelOutput({
      observations: [
        {
          type: 'OS_CHROME',
          confidence: 0.4,
          visualSignals: ['native title bar'],
          uncertainty: { level: 'HIGH', reasons: ['may be product'] },
          frameId: 'semantic-frame:0',
        },
        {
          type: 'FORM_REGION',
          confidence: 0.7,
          visualSignals: ['inputs'],
          uncertainty: { level: 'MEDIUM', reasons: ['partial'] },
          frameId: 'semantic-frame:0',
        },
      ],
    });
    expect(parsed.observations.map((item) => item.type)).toEqual(['OS_CHROME', 'FORM_REGION']);
  });

  it('vision prompts do not leak B1 hints', () => {
    const prompt = `${UI_STRUCTURE_SYSTEM_PROMPT}\n${buildUiStructureUserPrompt(['semantic-frame:1000', 'semantic-frame:2000'])}`;
    for (const leak of ['top strip', 'center crop', 'browser suspicion', 'old asset', 'c59dfd61', 'known product structure']) {
      expect(prompt.toLowerCase()).not.toContain(leak);
    }
    expect(UI_STRUCTURE_USER_PROMPT).toContain('APP_WINDOW_CHROME');
    expect(buildTextDeveloperUserPrompt(['semantic-frame:1'])).toContain('LOCALHOST_REFERENCE');
    expect(buildTextDeveloperUserPrompt(['semantic-frame:1'])).not.toContain('top strip');
  });

  it('rejects PRIVACY_SENSITIVE at model-facing layer', () => {
    expect(() =>
      validateVisualSemanticModelOutput({
        observations: [
          {
            type: 'PRIVACY_SENSITIVE',
            confidence: 0.9,
            visualSignals: ['x'],
            uncertainty: { level: 'LOW', reasons: ['x'] },
            frameId: 'f0',
          },
        ],
      }),
    ).toThrow(VisualSemanticProviderError);
  });
});
