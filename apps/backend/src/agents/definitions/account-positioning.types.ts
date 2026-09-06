export type AccountPositioningInput = {
  industry: string;
  platform: string;
  accountType: string;
  goal: string;
  targetAudience?: string;
  expertise?: string;
  additionalInfo?: string;
};

export type AccountPositioningOutput = {
  accountPositioning: string;
  targetAudience: {
    description: string;
    demographics?: string;
    interests?: string[];
    painPoints?: string[];
  };
  userPainPoints: string[];
  contentNiches: Array<{ name: string; reason: string }>;
  contentPillars: Array<{ name: string; description: string; percentage?: number }>;
  differentiation: string[];
  persona: {
    identity: string;
    tone: string;
    characteristics: string[];
  };
  profileBio: string;
  contentFormats: string[];
  publishingStrategy: {
    frequency: string;
    recommendedLength?: string;
    recommendedStyle?: string;
  };
  initialContentDirections: Array<{
    title: string;
    description: string;
    reason: string;
  }>;
};

export const ACCOUNT_POSITIONING_INPUT_KEYS = [
  'industry',
  'platform',
  'accountType',
  'goal',
  'targetAudience',
  'expertise',
  'additionalInfo',
] as const;

export const FORBIDDEN_CONTEXT_KEYS = ['tenantId', 'workspaceId', 'projectId', 'userId'] as const;
