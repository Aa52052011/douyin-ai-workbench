import { assembleHybridPackage, type HybridPackage } from './hybrid-assembler.js';
import type { HybridAssemblyInput, SemanticCropInputAssemblyV1 } from './hybrid.types.js';

export function assembleSemanticCropInput(input: HybridAssemblyInput): SemanticCropInputAssemblyV1 {
  return assembleHybridPackage(input).cropInput;
}

export function assembleHybridAndCrop(input: HybridAssemblyInput): HybridPackage {
  return assembleHybridPackage(input);
}
