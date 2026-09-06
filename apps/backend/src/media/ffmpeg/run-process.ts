import { spawn } from 'node:child_process';
import { composeFailed, MAX_FFMPEG_STDERR, MAX_FFMPEG_STDOUT } from './ffmpeg-config.js';

export async function runChildProcess(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; maxStderr?: number; maxStdout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, shell: false });
    const maxStderr = opts.maxStderr ?? MAX_FFMPEG_STDERR;
    const maxStdout = opts.maxStdout ?? MAX_FFMPEG_STDOUT;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(composeFailed('Video compose timed out')));
    }, opts.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > maxStdout) {
        stdout = stdout.slice(0, maxStdout);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > maxStderr) {
        stderr = stderr.slice(0, maxStderr);
      }
    });
    child.on('error', () => {
      finish(() => reject(composeFailed('Compose provider is unavailable')));
    });
    child.on('close', (code, signal) => {
      if (code === 0 && !signal) {
        finish(() => resolve({ stdout, stderr }));
        return;
      }
      finish(() => reject(composeFailed()));
    });

    function finish(done: () => void) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      done();
    }
  });
}
