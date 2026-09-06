export const POSITIONING_AGENT_ID = "account.positioning";
export const POSITIONING_AGENT_VERSION = "v1";

export const POSITIONING_INPUT_LIMITS = {
  industry: 100,
  platform: 50,
  accountType: 100,
  goal: 500,
  targetAudience: 500,
  expertise: 1000,
  additionalInfo: 2000,
} as const;

export const POSITIONING_REQUIRED_FIELDS = ["industry", "platform", "accountType", "goal"] as const;

export type PositioningInput = {
  industry: string;
  platform: string;
  accountType: string;
  goal: string;
  targetAudience?: string;
  expertise?: string;
  additionalInfo?: string;
};

export type PositioningOutput = {
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

export type PositioningRecord = {
  runId: string;
  createdAt: string;
  input: PositioningInput | null;
  output: PositioningOutput;
};

export type PositioningFormState = {
  industry: string;
  platform: string;
  accountType: string;
  goal: string;
  targetAudience: string;
  expertise: string;
  additionalInfo: string;
};
