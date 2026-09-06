import { describe, expect, it } from 'vitest';
import { parseDouyinItemIdFromUrl } from './parse-douyin-item-id.js';

describe('parseDouyinItemIdFromUrl', () => {
  it('extracts item ids from stable Douyin URL patterns', () => {
    expect(parseDouyinItemIdFromUrl('https://www.douyin.com/video/7471234567890123456')).toBe(
      '7471234567890123456',
    );
    expect(parseDouyinItemIdFromUrl('https://www.douyin.com/note/7471234567890123456')).toBe(
      '7471234567890123456',
    );
    expect(
      parseDouyinItemIdFromUrl('https://www.iesdouyin.com/share/video/7471234567890123456'),
    ).toBe('7471234567890123456');
    expect(
      parseDouyinItemIdFromUrl('https://www.douyin.com/jingxuan?modal_id=7471234567890123456'),
    ).toBe('7471234567890123456');
  });

  it('does not parse short links, unknown hosts, or non-http URLs', () => {
    expect(parseDouyinItemIdFromUrl('https://v.douyin.com/abc123/')).toBeNull();
    expect(parseDouyinItemIdFromUrl('https://example.com/video/7471234567890123456')).toBeNull();
    expect(parseDouyinItemIdFromUrl('not-a-url')).toBeNull();
    expect(parseDouyinItemIdFromUrl('javascript:alert(1)')).toBeNull();
    expect(parseDouyinItemIdFromUrl('')).toBeNull();
    expect(parseDouyinItemIdFromUrl(null)).toBeNull();
  });
});
