import { describe, expect, it } from 'vitest';
import { DeterministicMetadataAnalyzer } from './deterministic-metadata-analyzer.js';
import { DETERMINISTIC_MEDIA_ERROR } from './parse-analyzer-ffprobe.js';

describe('DeterministicMetadataAnalyzer', () => {
  it('fromAssetMetadata does not spawn a probe', () => {
    const analyzer = new DeterministicMetadataAnalyzer(async () => {
      throw new Error('should not probe');
    });
    const result = analyzer.fromAssetMetadata({
      assetId: 'b10d7b09-6dc8-41a4-b786-83077e53be73',
      contentHash: 'abc',
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.facts.status).toBe('PARTIAL');
      expect(result.facts.completedStages).toEqual(['METADATA', 'GEOMETRY']);
      expect(result.facts.metadata.orientation).toBe('PORTRAIT');
      expect(result.facts.metadata.hasAudio).toBe(false);
      expect(result.facts.frameSamplesSummary).toBeUndefined();
      expect(result.facts.warnings).toContain('IMAGE_METADATA_FROM_ASSET');
    }
  });

  it('analyzeFile maps silent video probe json', async () => {
    const analyzer = new DeterministicMetadataAnalyzer(async () => ({
      stdout: JSON.stringify({
        format: { duration: '35.107', size: '11383177' },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1040,
            avg_frame_rate: '30000/1001',
          },
        ],
      }),
    }));
    const result = await analyzer.analyzeFile({
      assetId: '803fafd2-4c0e-4412-80d7-a0d6452cefac',
      contentHash: 'hash',
      mimeType: 'video/mp4',
      filePath: 'logical://probe-only',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.facts.metadata.hasAudio).toBe(false);
      expect(result.facts.metadata.orientation).toBe('LANDSCAPE');
      expect(result.facts.metadata.durationMs).toBe(35107);
      expect(JSON.stringify(result)).not.toMatch(/logical:\/\//);
    }
  });

  it('maps probe runner failure without leaking paths', async () => {
    const analyzer = new DeterministicMetadataAnalyzer(async () => {
      throw new Error('ENOENT C:\\\\Users\\\\secret\\\\clip.mp4');
    });
    const result = await analyzer.analyzeFile({
      assetId: 'asset',
      filePath: 'C:\\Users\\secret\\clip.mp4',
    });
    expect(result).toEqual({ ok: false, code: DETERMINISTIC_MEDIA_ERROR.MEDIA_PROBE_FAILED });
  });
});
