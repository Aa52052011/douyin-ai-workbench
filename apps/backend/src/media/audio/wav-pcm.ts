import { WAV_BITS_PER_SAMPLE, WAV_CHANNELS, parseWavHeader } from './silent-wav.js';

export function wavPcmPeak(body: Buffer): number {
  if (body.length < 46) {
    return 0;
  }
  const header = parseWavHeader(body);
  const bytesPerSample = WAV_BITS_PER_SAMPLE / 8;
  const start = 44;
  const end = Math.min(body.length, start + header.dataSize);
  let peak = 0;
  for (let offset = start; offset + 1 < end; offset += bytesPerSample * WAV_CHANNELS) {
    const sample = Math.abs(body.readInt16LE(offset));
    if (sample > peak) {
      peak = sample;
    }
  }
  return peak;
}

export function wavIsAudible(body: Buffer, minPeak = 800): boolean {
  return wavPcmPeak(body) >= minPeak;
}
