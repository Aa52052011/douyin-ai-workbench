export type EditorialValueV1 = {
  improvesComprehension: boolean;
  improvesClaimEvidence: boolean;
  improvesReadability: boolean;
  improvesEmphasis: boolean;
};

export function reframeHasPositiveValue(value: EditorialValueV1): boolean {
  return value.improvesComprehension || value.improvesClaimEvidence || value.improvesReadability || value.improvesEmphasis;
}

export function valueOfBrokenUiCrop(): EditorialValueV1 {
  return {
    improvesComprehension: false,
    improvesClaimEvidence: false,
    improvesReadability: false,
    improvesEmphasis: false,
  };
}

export function valueOfCompleteEvidencePunchIn(): EditorialValueV1 {
  return {
    improvesComprehension: true,
    improvesClaimEvidence: true,
    improvesReadability: true,
    improvesEmphasis: true,
  };
}
