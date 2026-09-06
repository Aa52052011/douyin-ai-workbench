import { describe, expect, it } from 'vitest';
import { isLikelyPng } from './image-format.js';
import { encodeSolidPng, rgbFromSeed } from './color-background-png.js';
import { COLOR_BACKGROUND_HEIGHT, COLOR_BACKGROUND_WIDTH } from './visual-config.js';

describe('color-background png', () => {
  it('encodes a portrait png matching the local provider resolution', () => {
    const body = encodeSolidPng(COLOR_BACKGROUND_WIDTH, COLOR_BACKGROUND_HEIGHT, rgbFromSeed('scene-1'));
    expect(isLikelyPng(body)).toBe(true);
    expect(body.readUInt32BE(16)).toBe(COLOR_BACKGROUND_WIDTH);
    expect(body.readUInt32BE(20)).toBe(COLOR_BACKGROUND_HEIGHT);
    expect(body.byteLength).toBeGreaterThan(100);
  });
});
