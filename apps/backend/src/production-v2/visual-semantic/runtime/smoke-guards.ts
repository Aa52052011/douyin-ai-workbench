const BLOCKED_ASSET_PREFIXES = ['803fafd2', 'c59dfd61'];

export function assertSmokeHasNoAssetIdArg(argv: string[]): void {
  const hasFile = argv.some((arg) => arg === '--file' || arg.startsWith('--file='));
  const hasAsset = argv.some((arg) => arg === '--assetId' || arg.startsWith('--assetId='));
  if (hasFile || hasAsset) {
    throw new Error('SMOKE_REJECTS_EXTERNAL_INPUT');
  }
}

export function assertNotDogfoodAsset(assetId: string): void {
  const lower = assetId.toLowerCase();
  if (BLOCKED_ASSET_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(prefix))) {
    throw new Error('SMOKE_REJECTS_DOGFOOD_ASSET');
  }
}

export const SMOKE_ASSET_ID = 'synthetic-b2-4-product-ui';
