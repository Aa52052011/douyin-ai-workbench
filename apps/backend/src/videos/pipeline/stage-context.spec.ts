import { describe, expect, it } from 'vitest';
import { asPipelineOutput, mockFailStage, mockFailVisualAfter } from './stage-context.js';

describe('pipeline output merge', () => {
  it('merges voice usage without dropping visual usage or stages', () => {
    const output = asPipelineOutput({
      stages: {
        visual: { status: 'completed', assetIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
      },
      usage: { imageCount: 2, audioCharacters: 0, audioSeconds: 0, videoSeconds: 0, estimatedCost: 0 },
      timeline: { targetDuration: 15 },
    });
    output.stages.voice = {
      status: 'completed',
      assetIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      duration: 3,
      provider: 'openai-tts',
      model: 'test-model',
    };
    output.usage = { ...output.usage, audioCharacters: 9, audioSeconds: 3, estimatedCost: 0 };
    expect(output.stages.visual?.assetIds).toHaveLength(1);
    expect(output.usage.imageCount).toBe(2);
    expect(output.usage.audioSeconds).toBe(3);
    expect(output.timeline?.targetDuration).toBe(15);
    expect(JSON.stringify(output)).not.toContain('apiKey');
  });
});

describe('mock fail tokens', () => {
  it('parses scene-level visual failure after N scenes', () => {
    expect(mockFailVisualAfter('__mock_fail_visual_after_3__')).toBe(3);
    expect(mockFailVisualAfter('__mock_fail_visual__')).toBeUndefined();
    expect(mockFailStage('__mock_fail_visual__')).toBe('visual');
  });
});
