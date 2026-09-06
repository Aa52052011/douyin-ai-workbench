import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseWavHeader } from './silent-wav.js';
import { isLikelyWav } from './audio-format.js';
import { isFfprobeAvailable } from '../ffmpeg/ffmpeg-available.js';
import { ffprobeBin } from '../ffmpeg/ffmpeg-config.js';
import { buildFfprobeArgs, parseFfprobeAudioDuration } from '../ffmpeg/ffprobe.js';
import { runChildProcess } from '../ffmpeg/run-process.js';

export async function probeAudioDuration(body: Buffer, mimeType: string): Promise<number | null> {
  if ((mimeType === 'audio/wav' || mimeType === 'audio/wave') && isLikelyWav(body)) {
    const parsed = parseWavHeader(body);
    if (parsed.riff === 'RIFF' && parsed.wave === 'WAVE' && parsed.duration > 0) {
      return parsed.duration;
    }
  }
  if (!isFfprobeAvailable()) {
    return null;
  }
  const work = await mkdtemp(path.join(os.tmpdir(), 'acf-tts-probe-'));
  const ext = mimeType === 'audio/mpeg' ? '.mp3' : '.wav';
  const filePath = path.join(work, `probe${ext}`);
  try {
    await writeFile(filePath, body);
    const probed = await runChildProcess(ffprobeBin(), buildFfprobeArgs(filePath), { timeoutMs: 15_000 });
    return parseFfprobeAudioDuration(probed.stdout);
  } catch {
    return null;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
