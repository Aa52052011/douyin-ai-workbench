/**
 * Local-only synthetic JPEG generator. Does not call image-generation APIs.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rasterizePpmToJpeg, renderSyntheticProductUiPpm } from '../src/production-v2/visual-semantic/runtime/synthetic-product-ui-fixture.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/production-v2/visual-semantic/fixtures');
const outPath = path.join(outDir, 'synthetic-product-ui.jpg');
await mkdir(outDir, { recursive: true });
const meta = await rasterizePpmToJpeg(renderSyntheticProductUiPpm(), outPath);
process.stdout.write(`${JSON.stringify({ outPath: 'fixtures/synthetic-product-ui.jpg', ...meta })}\n`);
