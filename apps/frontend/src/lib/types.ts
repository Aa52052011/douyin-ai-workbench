export type Workspace = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  industry: string | null;
  platform: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentDefinition = {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
};

export type AgentRun = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  agentVersion: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  requestId: string;
  durationMs: number | null;
  createdAt: string;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCost: string | null;
  };
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
  persona: { identity: string; tone: string; characteristics: string[] };
  profileBio: string;
  contentFormats: string[];
  publishingStrategy: {
    frequency: string;
    recommendedLength?: string;
    recommendedStyle?: string;
  };
  initialContentDirections: Array<{ title: string; description: string; reason: string }>;
};

export type ContentTopic = {
  id: string;
  dayIndex: number;
  title: string;
  hook: string;
  contentPillar: string;
  targetAudience: string;
  painPoint: string;
  contentAngle: string;
  format: string;
  estimatedDuration: string;
  priority: "high" | "medium" | "low";
  reason: string;
  keywords: string[];
  cta: string;
  status: string;
  scheduledDate?: string;
};

export type ContentPlanPayload = {
  title: string;
  summary: string;
  planningDays: number;
  postsPerDay: number;
  platform: string;
  contentStyle?: string;
  additionalRequirements?: string;
  pillarAllocation: Array<{ pillarName: string; percentage: number; topicCount: number }>;
  usedTrendData: boolean;
  trendNote: string;
  topics: ContentTopic[];
};

export type ContentPlan = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "CONFIRMED" | "ARCHIVED" | string;
  version: number;
  payload: ContentPlanPayload;
  positioningSnapshot: AccountPositioningOutput | unknown;
  sourceAgentRunId: string | null;
  planningDays: number | null;
  postsPerDay: number | null;
  platform: string | null;
  usedTrendData: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScriptSection = {
  sequence: number;
  narration: string;
  visualSuggestion: string;
  subtitle: string;
  duration: number;
};

export type ScriptPayload = {
  title: string;
  hook: string;
  opening: string;
  sections: ScriptSection[];
  ending: string;
  cta: string;
  totalDuration: number;
  estimatedWordCount: number;
  voiceStyle: string;
  visualStyle: string;
  productionNotes: string[];
};

export type Script = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  contentPlanId: string | null;
  topicId: string | null;
  title: string;
  content: string;
  version: number;
  status: "DRAFT" | "CONFIRMED" | "ARCHIVED" | string;
  payload: ScriptPayload;
  topicSnapshot: ContentTopic | unknown;
  sourceAgentRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Asset = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  type: string;
  status: string;
  originalFilename: string | null;
  mimeType: string | null;
  size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  metadata: unknown;
  contentPath: string;
  createdAt: string;
  updatedAt: string;
  sourceType?: string;
  sourceLabel?: string;
  referenceOnly?: boolean;
  reusable?: boolean;
  rightsStatus?: string;
  rightsLabel?: string;
  libraryVisible?: boolean;
  usedCount?: number;
  typeLabel?: string;
};

export type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  input?: unknown;
  output?: unknown;
  error: { code?: string; message?: string } | unknown;
  requestId: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type Video = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  scriptId: string | null;
  scriptTitle: string | null;
  outputAssetId: string | null;
  sourceJobId: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  job: Job | null;
  outputAsset: Asset | null;
};

