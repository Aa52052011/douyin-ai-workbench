import {
  ACCEPTED_LANDSCAPE_SHA_V2,
  ACCEPTED_VERTICAL_SHA_V2,
  LANDSCAPE_V2_RELATIVE_PATH,
  VERTICAL_V2_RELATIVE_PATH,
} from '../production-v2/global-director/publication-acceptance.js';
import {
  LANDSCAPE_ARTIFACT_V2_ID,
  VERTICAL_ARTIFACT_V2_ID,
} from '../production-v2/global-director/final-production-v2-authorization.js';
import { FROZEN_SCRIPT_ID } from '../production-v2/audio-calibration/audio-integration.js';
import { AppError, ErrorCode } from '../common/errors/app-error.js';

export const CONTENT_01_PROJECT_ID = '01a08b3f-9638-7fd1-a1ee-344682fb4809';
export const CONTENT_01_TENANT_ID = '01a08b24-3e53-7543-9b8b-3f0fc3eb61fb';
export const CONTENT_01_WORKSPACE_ID = '01a08b24-3e55-7022-82c1-7bfa494e755b';
export const DEFAULT_DOUYIN_CANDIDATE_ARTIFACT_ID = VERTICAL_ARTIFACT_V2_ID;

export type ArtifactAcceptanceStatus = 'ACCEPTED' | 'NOT_ACCEPTED';

export type AcceptedProductionArtifactV1 = {
  artifactId: string;
  sha256: string;
  relativePath: string;
  orientation: 'VERTICAL' | 'LANDSCAPE';
  defaultDouyinCandidate: boolean;
  acceptance: ArtifactAcceptanceStatus;
  scriptId: string;
  projectId: string;
};

const CATALOG: AcceptedProductionArtifactV1[] = [
  {
    artifactId: VERTICAL_ARTIFACT_V2_ID,
    sha256: ACCEPTED_VERTICAL_SHA_V2,
    relativePath: VERTICAL_V2_RELATIVE_PATH,
    orientation: 'VERTICAL',
    defaultDouyinCandidate: true,
    acceptance: 'ACCEPTED',
    scriptId: FROZEN_SCRIPT_ID,
    projectId: CONTENT_01_PROJECT_ID,
  },
  {
    artifactId: LANDSCAPE_ARTIFACT_V2_ID,
    sha256: ACCEPTED_LANDSCAPE_SHA_V2,
    relativePath: LANDSCAPE_V2_RELATIVE_PATH,
    orientation: 'LANDSCAPE',
    defaultDouyinCandidate: false,
    acceptance: 'ACCEPTED',
    scriptId: FROZEN_SCRIPT_ID,
    projectId: CONTENT_01_PROJECT_ID,
  },
];

export function acceptedArtifactCatalog(): AcceptedProductionArtifactV1[] {
  return CATALOG.map((row) => ({ ...row }));
}

export function findAcceptedArtifact(artifactId: string): AcceptedProductionArtifactV1 | null {
  return CATALOG.find((row) => row.artifactId === artifactId) ?? null;
}

export function defaultDouyinPublicationCandidate(): AcceptedProductionArtifactV1 {
  const found = CATALOG.find((row) => row.defaultDouyinCandidate);
  if (!found) throw new Error('DEFAULT_DOUYIN_CANDIDATE_MISSING');
  return { ...found };
}

export function requireAcceptedArtifact(artifactId: string): AcceptedProductionArtifactV1 {
  const found = findAcceptedArtifact(artifactId);
  if (!found || found.acceptance !== 'ACCEPTED') {
    throw new AppError(ErrorCode.ARTIFACT_NOT_ACCEPTED);
  }
  return { ...found };
}

export function canEnterAwaitingManualPublication(artifactId: string): boolean {
  try {
    requireAcceptedArtifact(artifactId);
    return true;
  } catch {
    return false;
  }
}
