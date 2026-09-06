export const WAV_SAMPLE_RATE = 44_100;
export const WAV_CHANNELS = 1;
export const WAV_BITS_PER_SAMPLE = 16;

export function buildSilentWav(durationSeconds: number, sampleRate = WAV_SAMPLE_RATE): Buffer {
  const seconds = Math.max(1, Math.ceil(durationSeconds));
  const samples = seconds * sampleRate;
  const dataSize = samples * (WAV_BITS_PER_SAMPLE / 8) * WAV_CHANNELS;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(WAV_CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

export function parseWavHeader(body: Buffer): {
  riff: string;
  wave: string;
  sampleRate: number;
  dataSize: number;
  duration: number;
} {
  const sampleRate = body.readUInt32LE(24);
  const dataSize = body.readUInt32LE(40);
  return {
    riff: body.toString('ascii', 0, 4),
    wave: body.toString('ascii', 8, 12),
    sampleRate,
    dataSize,
    duration: dataSize / (sampleRate * WAV_CHANNELS * (WAV_BITS_PER_SAMPLE / 8)),
  };
}
