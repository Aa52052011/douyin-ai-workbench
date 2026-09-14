export type DataUrlPayload = {
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  base64CharLength: number;
  dataUrl: string;
};

export function bytesToDataUrl(bytes: Buffer, mimeType: 'image/jpeg' | 'image/png'): DataUrlPayload {
  const base64 = bytes.toString('base64');
  return {
    mimeType,
    byteSize: bytes.byteLength,
    base64CharLength: base64.length,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

export function redactDataUrl(value: string): string {
  if (value.startsWith('data:image/')) {
    const comma = value.indexOf(',');
    const header = comma >= 0 ? value.slice(0, comma) : 'data:image';
    return `${header},[redacted]`;
  }
  return '[redacted-url]';
}
