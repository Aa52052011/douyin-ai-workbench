import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { composeFailed } from './ffmpeg-config.js';
import { runChildProcess } from './run-process.js';

describe('runChildProcess', () => {
  it('sanitizes compose errors without leaking commands', () => {
    const error = composeFailed();
    expect(error.code).toBe(ErrorCode.VIDEO_PROVIDER_FAILED);
    expect(error.message).not.toContain('ffmpeg');
    expect(error.message).not.toContain('C:\\');
  });

  it('times out and does not use a shell', async () => {
    await expect(runChildProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 200 })).rejects.toMatchObject({
      code: ErrorCode.VIDEO_PROVIDER_FAILED,
    });
  });

  it('keeps stdout large enough for ffprobe json', async () => {
    const payload = 'x'.repeat(5000);
    const result = await runChildProcess(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(payload)})`], {
      timeoutMs: 5_000,
    });
    expect(result.stdout.length).toBe(5000);
  });
});
