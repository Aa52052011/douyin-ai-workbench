import type {
  VisualSemanticAnalysisRequest,
  VisualSemanticProviderCapabilities,
  VisualSemanticProviderFamily,
  VisualSemanticProviderResult,
} from '../contracts/provider-runtime.types.js';

export type VisualSemanticProvider = {
  readonly providerId: string;
  readonly providerFamily: VisualSemanticProviderFamily;
  readonly capabilities: VisualSemanticProviderCapabilities;
  analyzeImage(input: VisualSemanticAnalysisRequest): Promise<VisualSemanticProviderResult>;
  analyzeVideoFrames(input: VisualSemanticAnalysisRequest): Promise<VisualSemanticProviderResult>;
};

export const DEFAULT_MOCK_CAPABILITIES: VisualSemanticProviderCapabilities = {
  imageAnalysis: true,
  multiFrameAnalysis: true,
  structuredOutput: true,
  ocr: false,
  regionGrounding: true,
  temporalReasoning: true,
};
