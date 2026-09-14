export const MANUAL_PUBLICATION_WORKFLOW_STATES = [
  'FINAL_VIDEO_ACCEPTED',
  'FINAL_VIDEO_EXPORTED',
  'AWAITING_MANUAL_PUBLICATION',
  'USER_PUBLISHED_EXTERNALLY',
  'POST_REGISTRATION_REQUIRED',
  'POST_REGISTERED',
  'MONITORING_READY',
] as const;

export type ManualPublicationWorkflowState = (typeof MANUAL_PUBLICATION_WORKFLOW_STATES)[number];

const ORDER: Record<ManualPublicationWorkflowState, number> = {
  FINAL_VIDEO_ACCEPTED: 0,
  FINAL_VIDEO_EXPORTED: 1,
  AWAITING_MANUAL_PUBLICATION: 2,
  USER_PUBLISHED_EXTERNALLY: 3,
  POST_REGISTRATION_REQUIRED: 4,
  POST_REGISTERED: 5,
  MONITORING_READY: 6,
};

export function manualPublicationWorkflowV1() {
  return {
    schemaVersion: 'manual.publication-workflow:v1',
    states: [...MANUAL_PUBLICATION_WORKFLOW_STATES],
    publishMode: 'MANUAL' as const,
    currentProductMode: 'MANUAL_EXPORT_ONLY' as const,
    doesNotImply: ['PUBLISHED_VIA_OFFICIAL_API', 'PLATFORM_VERIFIED'],
  };
}

export function canAdvanceManualPublication(
  from: ManualPublicationWorkflowState,
  to: ManualPublicationWorkflowState,
): boolean {
  return ORDER[to] === ORDER[from] + 1 || to === from;
}

export function monitoringReadyAfterRegistration(input: {
  registered: boolean;
  platformPostId?: string | null;
  platformUrl?: string | null;
}): boolean {
  if (!input.registered) return false;
  return Boolean(input.platformPostId?.trim() || input.platformUrl?.trim());
}
