import { WAV_BITS_PER_SAMPLE, WAV_CHANNELS, WAV_SAMPLE_RATE } from './silent-wav.js';

/** Deterministic non-silent local WAV when system TTS is unavailable. Not a production voice. */
export function buildAudiblePlaceholderWav(durationSeconds: number, seed = 'acf-mock-tts'): Buffer {
  const seconds = Math.max(1, Math.ceil(durationSeconds));
  const samples = seconds * WAV_SAMPLE_RATE;
  const dataSize = samples * (WAV_BITS_PER_SAMPLE / 8) * WAV_CHANNELS;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(WAV_CHANNELS, 22);
  buffer.writeUInt32LE(WAV_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(WAV_SAMPLE_RATE * WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const baseFreq = 180 + (hash % 80);
  for (let i = 0; i < samples; i += 1) {
    const t = i / WAV_SAMPLE_RATE;
    const syllable = Math.sin(2 * Math.PI * (baseFreq + (hash % 40)) * t);
    const envelope = (Math.sin(2 * Math.PI * 3.2 * t) + 1) / 2;
    const gated = envelope > 0.35 ? envelope : 0;
    const sample = Math.round(syllable * gated * 0.22 * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}
