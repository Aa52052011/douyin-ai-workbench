import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { normalizeIncomingProjectPlatform } from './project-platform.js';

describe('project platform normalization', () => {
  it('maps aliases to douyin and drops empty', () => {
    expect(normalizeIncomingProjectPlatform('抖音')).toBe('douyin');
    expect(normalizeIncomingProjectPlatform('DOUYIN')).toBe('douyin');
    expect(normalizeIncomingProjectPlatform('')).toBeUndefined();
    expect(normalizeIncomingProjectPlatform('kuaishou')).toBe('kuaishou');
  });
});

describe('CreateProjectDto platform', () => {
  it('accepts douyin and 抖音 alias', () => {
    for (const platform of ['douyin', '抖音']) {
      const dto = plainToInstance(CreateProjectDto, { name: 'Demo', platform });
      const errors = validateSync(dto);
      expect(errors).toEqual([]);
      expect(dto.platform).toBe('douyin');
    }
  });

  it('rejects unknown platform strings', () => {
    const dto = plainToInstance(CreateProjectDto, { name: 'Demo', platform: 'kuaishou' });
    const errors = validateSync(dto);
    expect(errors.some((item) => item.property === 'platform')).toBe(true);
  });

  it('allows omitted platform', () => {
    const dto = plainToInstance(CreateProjectDto, { name: 'Demo' });
    expect(validateSync(dto)).toEqual([]);
  });
});

describe('UpdateProjectDto platform', () => {
  it('accepts douyin on patch', () => {
    const dto = plainToInstance(UpdateProjectDto, { platform: 'douyin' });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects future platform writes in V1', () => {
    const dto = plainToInstance(UpdateProjectDto, { platform: 'bilibili' });
    expect(validateSync(dto).some((item) => item.property === 'platform')).toBe(true);
  });
});
