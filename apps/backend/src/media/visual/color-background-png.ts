import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([header.subarray(4, 8), data])), 0);
  return Buffer.concat([header, data, crcBuf]);
}

export function rgbFromSeed(seed: string): { r: number; g: number; b: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return {
    r: 48 + (hash & 127),
    g: 48 + ((hash >>> 8) & 127),
    b: 48 + ((hash >>> 16) & 127),
  };
}

const pngCache = new Map<string, Buffer>();

export function encodeSolidPng(width: number, height: number, rgb: { r: number; g: number; b: number }): Buffer {
  const cacheKey = `${width}x${height}:${rgb.r},${rgb.g},${rgb.b}`;
  const cached = pngCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = 1 + width * 3;
  const first = Buffer.alloc(stride);
  first[0] = 0;
  for (let x = 0; x < width; x += 1) {
    const offset = 1 + x * 3;
    first[offset] = rgb.r;
    first[offset + 1] = rgb.g;
    first[offset + 2] = rgb.b;
  }
  const up = Buffer.alloc(stride);
  up[0] = 2;
  const raw = Buffer.alloc(stride * height);
  first.copy(raw, 0);
  for (let y = 1; y < height; y += 1) {
    up.copy(raw, y * stride);
  }
  const idat = deflateSync(raw, { level: 1 });
  const body = Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  pngCache.set(cacheKey, body);
  return body;
}
